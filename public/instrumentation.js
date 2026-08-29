// Minimal AsyncLens instrumentation (MVP)
// Place <script src="/instrumentation.js"></script> in your pages.
// Sends events to POST /asynclens/events on the same origin.

(function AsyncLensAgent(){
  const collectorUrl = window.__ASYNCLENS_COLLECTOR__ || '/asynclens/events';

  function genId(prefix='id'){
    return prefix + ':' + Math.random().toString(36).slice(2,10);
  }

  function safeSend(event){
    try {
      event.timestamp = Date.now();
      // navigator.sendBeacon expects a Blob or string
      const body = JSON.stringify(event);
      if (navigator.sendBeacon) {
        // sendBeacon can't reliably set JSON content-type, but collector will accept JSON body
        navigator.sendBeacon(collectorUrl, body);
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
      console.warn('AsyncLens send error', e);
    }
  }

  // Wrap fetch
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(...args){
      const entityId = genId('fetch');
      safeSend({
        id: genId('evt'),
        type: 'fetch:start',
        entity: { kind: 'fetch', entityId },
        payload: { request: args[0] && String(args[0]) }
      });
      const p = origFetch.apply(this, args);
      p.then(res => {
        safeSend({
          id: genId('evt'),
          type: 'fetch:end',
          entity: { kind: 'fetch', entityId },
          payload: { status: res && res.status }
        });
        return res;
      }).catch(err => {
        safeSend({
          id: genId('evt'),
          type: 'fetch:error',
          entity: { kind: 'fetch', entityId },
          payload: { error: String(err) }
        });
        throw err;
      });
      return p;
    };
  }

  // Wrap setTimeout
  const origSetTimeout = window.setTimeout;
  window.setTimeout = function(fn, delay = 0, ...rest){
    const entityId = genId('timer');
    safeSend({
      id: genId('evt'),
      type: 'timer:set',
      entity: { kind: 'timer', entityId },
      payload: { delay }
    });
    return origSetTimeout(function(...a){
      safeSend({
        id: genId('evt'),
        type: 'timer:fire',
        entity: { kind: 'timer', entityId }
      });
      return fn.apply(this, a);
    }, delay, ...rest);
  };

  // Basic Promise.prototype.then wrapper (conservative)
  const origThen = Promise.prototype.then;
  Promise.prototype.then = function(onFulfilled, onRejected){
    const entityId = genId('promise');
    safeSend({ id: genId('evt'), type: 'promise:create', entity: { kind:'promise', entityId }});
    const wrappedFulfilled = typeof onFulfilled === 'function' ? function(v){
      safeSend({ id: genId('evt'), type: 'then:call', entity: { kind:'promise', entityId }});
      return onFulfilled(v);
    } : onFulfilled;
    const wrappedRejected = typeof onRejected === 'function' ? function(e){
      safeSend({ id: genId('evt'), type: 'catch:call', entity: { kind:'promise', entityId }, payload:{ error: String(e) }});
      return onRejected(e);
    } : onRejected;
    return origThen.call(this, wrappedFulfilled, wrappedRejected);
  };

  // Expose helper (optional)
  window.AsyncLens = {
    send: safeSend
  };
})();
