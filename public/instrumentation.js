// public/instrumentation.js
// AsyncLens instrumentation - extended
// Captures fetch, timers, promises, websockets, Promise.all/race, and provides helper APIs.

(function AsyncLensAgent(){
  const collectorUrl = window.__ASYNCLENS_COLLECTOR__ || '/asynclens/events';
  const MAX_PAYLOAD_CHARS = 2000; // avoid sending huge bodies

  function genId(prefix='id'){
    return prefix + ':' + Math.random().toString(36).slice(2,10);
  }

  // lightweight recent-entity context to help link related events
  // This is heuristic: it captures the last "active" entity id for short-lived operations
  const recentEntities = [];
  function pushRecentEntity(id){
    if (!id) return;
    recentEntities.push({ id, t: Date.now() });
    // keep small
    if (recentEntities.length > 50) recentEntities.shift();
  }
  function getRecentEntity(maxAgeMs = 2000){
    // return last entity not older than maxAgeMs
    for (let i = recentEntities.length - 1; i >= 0; --i){
      if ((Date.now() - recentEntities[i].t) <= maxAgeMs) return recentEntities[i].id;
    }
    return null;
  }

  function safeStringify(obj, limit = MAX_PAYLOAD_CHARS){
    try {
      const s = JSON.stringify(obj);
      return s.length > limit ? s.slice(0, limit) + '...<truncated>' : s;
    } catch(e){
      try { return String(obj).slice(0, limit); } catch(_) { return '' }
    }
  }

  function safeSend(event){
    try {
      event.timestamp = Date.now();
      // limit payload contents somewhat
      if (event.payload && typeof event.payload === 'object') {
        // shallow sanitize
        if (event.payload.request && typeof event.payload.request !== 'string') {
          event.payload.request = safeStringify(event.payload.request, 1000);
        }
        if (event.payload.data && typeof event.payload.data !== 'string') {
          event.payload.data = safeStringify(event.payload.data, 1000);
        }
      }

      const body = JSON.stringify(event);
      if (navigator.sendBeacon) {
        // send a JSON Blob so the server's JSON parser can parse it
        navigator.sendBeacon(collectorUrl, new Blob([body], { type: 'application/json' }));
      } else {
        // non-blocking fetch; don't await
        fetch(collectorUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        }).catch(()=>{ /* swallow errors */ });
      }
    } catch(e){
      // never throw in instrumentation
      try { console.warn('AsyncLens send error', e); } catch(_) {}
    }
  }

  // --- FETCH instrumentation (measures duration, parent linking)
  (function wrapFetch(){
    const origFetch = window.fetch;
    if (!origFetch) return;

    window.fetch = function(...args){
      const entityId = genId('fetch');
      const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const parent = getRecentEntity(3000);

      safeSend({
        id: genId('evt'),
        type: 'fetch:start',
        entity: { kind: 'fetch', entityId },
        parentIds: parent ? [parent] : undefined,
        payload: { request: args[0] && String(args[0]) }
      });
      pushRecentEntity(entityId);

      const p = origFetch.apply(this, args);
      p.then(res => {
        const durationMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - start);
        safeSend({
          id: genId('evt'),
          type: 'fetch:end',
          entity: { kind: 'fetch', entityId },
          parentIds: parent ? [parent] : undefined,
          payload: { status: res && res.status, durationMs }
        });
        return res;
      }).catch(err => {
        const durationMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - start);
        safeSend({
          id: genId('evt'),
          type: 'fetch:error',
          entity: { kind: 'fetch', entityId },
          parentIds: parent ? [parent] : undefined,
          payload: { error: String(err), durationMs }
        });
        throw err;
      });
      return p;
    };
  })();

  // --- setTimeout + setInterval
  (function wrapTimers(){
    const origSetTimeout = window.setTimeout;
    const origSetInterval = window.setInterval;

    window.setTimeout = function(fn, delay = 0, ...rest){
      const entityId = genId('timer');
      const parent = getRecentEntity(3000);
      safeSend({ id: genId('evt'), type: 'timer:set', entity: { kind: 'timer', entityId }, parentIds: parent ? [parent] : undefined, payload:{ delay }});
      pushRecentEntity(entityId);
      return origSetTimeout(function(...a){
        safeSend({ id: genId('evt'), type: 'timer:fire', entity: { kind: 'timer', entityId }, parentIds: parent ? [parent] : undefined });
        return fn.apply(this, a);
      }, delay, ...rest);
    };

    window.setInterval = function(fn, delay = 0, ...rest){
      const entityId = genId('interval');
      const parent = getRecentEntity(3000);
      safeSend({ id: genId('evt'), type: 'interval:set', entity: { kind: 'timer', entityId }, parentIds: parent ? [parent] : undefined, payload:{ delay }});
      pushRecentEntity(entityId);
      return origSetInterval(function(...a){
        safeSend({ id: genId('evt'), type: 'interval:tick', entity: { kind: 'timer', entityId }, parentIds: parent ? [parent] : undefined });
        return fn.apply(this, a);
      }, delay, ...rest);
    };
  })();

  // --- Promise.prototype.then wrapper (add parent linking)
  (function wrapPromiseThen(){
    const origThen = Promise.prototype.then;
    if (!origThen) return;
    Promise.prototype.then = function(onFulfilled, onRejected){
      const promiseEntityId = genId('promise');
      const parent = getRecentEntity(3000);
      safeSend({ id: genId('evt'), type: 'promise:create', entity: { kind:'promise', entityId: promiseEntityId }, parentIds: parent ? [parent] : undefined });
      pushRecentEntity(promiseEntityId);

      const wrappedFulfilled = typeof onFulfilled === 'function' ? function(v){
        safeSend({ id: genId('evt'), type: 'then:call', entity: { kind:'promise', entityId: promiseEntityId } });
        return onFulfilled(v);
      } : onFulfilled;
      const wrappedRejected = typeof onRejected === 'function' ? function(e){
        safeSend({ id: genId('evt'), type: 'catch:call', entity: { kind:'promise', entityId: promiseEntityId }, payload:{ error: String(e) }});
        return onRejected(e);
      } : onRejected;
      return origThen.call(this, wrappedFulfilled, wrappedRejected);
    };
  })();

  // --- Promise.all / race override (lightweight)
  (function wrapPromiseAllRace(){
    const origAll = Promise.all;
    const origRace = Promise.race;
    if (origAll) {
      Promise.all = function(iterable){
        const id = genId('promise_all');
        const parents = []; try { for (const p of iterable) { if (p && p._asyncLensId) parents.push(p._asyncLensId); } } catch(e){}
        safeSend({ id: genId('evt'), type: 'promise:all', entity: { kind:'promise_all', entityId: id }, parentIds: parents.length ? parents : undefined });
        const res = origAll.call(Promise, iterable);
        res._asyncLensId = id;
        return res;
      };
    }
    if (origRace) {
      Promise.race = function(iterable){
        const id = genId('promise_race');
        const parents = []; try { for (const p of iterable) { if (p && p._asyncLensId) parents.push(p._asyncLensId); } } catch(e){}
        safeSend({ id: genId('evt'), type: 'promise:race', entity: { kind:'promise_race', entityId: id }, parentIds: parents.length ? parents : undefined });
        const res = origRace.call(Promise, iterable);
        res._asyncLensId = id;
        return res;
      };
    }
  })();

  // --- async helper wrapper to make await points explicit if developer wants
  function wrapAsync(fn, name){
    if (typeof fn !== 'function') return fn;
    return function wrappedAsync(...args){
      const entityId = genId('async');
      safeSend({ id: genId('evt'), type: 'async:start', entity:{ kind:'async', entityId }, payload:{ name: name || fn.name || 'anonymous' }, parentIds: getRecentEntity() ? [getRecentEntity()] : undefined });
      pushRecentEntity(entityId);
      try {
        const result = fn.apply(this, args);
        return Promise.resolve(result).then(r => {
          safeSend({ id: genId('evt'), type: 'async:end', entity:{ kind:'async', entityId }, payload:{ name: name || fn.name || 'anonymous' } });
          return r;
        }).catch(e => {
          safeSend({ id: genId('evt'), type: 'async:error', entity:{ kind:'async', entityId }, payload:{ error: String(e) } });
          throw e;
        });
      } catch(e){
        safeSend({ id: genId('evt'), type: 'async:error', entity:{ kind:'async', entityId }, payload:{ error: String(e) } });
        throw e;
      }
    };
  }

  // expose helper
  window.AsyncLens = window.AsyncLens || {};
  window.AsyncLens.send = safeSend;
  window.AsyncLens.genId = genId;
  window.AsyncLens.wrapAsync = wrapAsync;

  // --- WebSocket instrumentation
  (function wrapWebSocket(){
    const OrigWS = window.WebSocket;
    if (!OrigWS) return;
    function WrappedWS(url, protocols){
      const ws = new OrigWS(url, protocols);
      const entityId = genId('ws');
      const parent = getRecentEntity(3000);
      safeSend({ id: genId('evt'), type: 'ws:open', entity: { kind: 'websocket', entityId }, parentIds: parent ? [parent] : undefined, payload: { url: String(url) } });
      pushRecentEntity(entityId);
      ws.addEventListener('message', (ev) => {
        safeSend({ id: genId('evt'), type: 'ws:message', entity: { kind:'websocket', entityId }, payload: { data: String(ev.data).slice(0,500) } });
      });
      const origSend = ws.send;
      ws.send = function(data){
        safeSend({ id: genId('evt'), type:'ws:send', entity:{kind:'websocket', entityId}, payload:{data:String(data).slice(0,500)} });
        return origSend.call(ws, data);
      };
      ws.addEventListener('close', () => safeSend({ id: genId('evt'), type:'ws:close', entity:{kind:'websocket', entityId} }));
      return ws;
    }
    WrappedWS.prototype = OrigWS.prototype;
    window.WebSocket = WrappedWS;
  })();

  // --- Microtask & event-loop probing (lightweight)
  (function eventLoopProbe(){
    if (!window.performance) return;
    // measure microtask vs macrotask delay periodically
    setInterval(() => {
      const start = performance.now();
      Promise.resolve().then(() => {
        const micro = Math.round(performance.now() - start);
        setTimeout(() => {
          const macro = Math.round(performance.now() - start);
          safeSend({ id: genId('evt'), type: 'eventloop:probe', entity: { kind:'probe', entityId: genId('probe') }, payload: { micro, macro } });
        }, 0);
      });
    }, 10000); // every 10s
  })();

})();
