// extension/instrumentation.js
// Lightweight in-page instrumentation that posts events via window.postMessage to be collected by the extension.
(function(){
  function genId(prefix='id'){ return prefix + ':' + Math.random().toString(36).slice(2,10); }
  function now(){ return Date.now(); }

  function send(event){
    try{ window.postMessage({ __AsyncLensEvent: true, event }, '*'); }catch(e){}
  }

  // basic fetch wrapper
  try{
    const origFetch = window.fetch;
    if (typeof origFetch === 'function'){
      window.fetch = function(input, init){
        const id = genId('fetch');
        const url = (typeof input === 'string') ? input : (input && input.url) || '';
        send({ id, type: 'fetch:start', timestamp: now(), payload: { request: url } });
        const t0 = now();
        return origFetch.apply(this, arguments).then(res => {
          const dur = now() - t0;
          try{ res.clone().text().then(text => { send({ id, type: 'fetch:end', timestamp: now(), payload: { status: res.status, durationMs: dur, data: String(text).slice(0,200) } }); }).catch(()=>{ send({ id, type: 'fetch:end', timestamp: now(), payload: { status: res.status, durationMs: dur } }); }); }catch(e){ send({ id, type: 'fetch:end', timestamp: now(), payload: { status: res.status, durationMs: dur } }); }
          return res;
        }).catch(err => { send({ id, type: 'fetch:error', timestamp: now(), payload: { message: String(err) } }); throw err; });
      };
    }
  }catch(e){}

  // timer instrumentation with basic rate limiting
  try{
    const origSetTimeout = window.setTimeout;
    const RATE_LIMIT_MS = 200;
    const lastSent = new Map();
    window.setTimeout = function(fn, delay){
      if (typeof fn !== 'function') return origSetTimeout.apply(this, arguments);
      const id = genId('timer');
      const d = Number(delay) || 0;
      if (d >= 10) send({ id, type: 'timer:scheduled', timestamp: now(), payload: { delay: d } });
      return origSetTimeout(function(){
        try{
          const last = lastSent.get(id) || 0;
          const nowT = Date.now();
          if (nowT - last > RATE_LIMIT_MS){ send({ id, type: 'timer:callback', timestamp: nowT, payload: { delay: d } }); lastSent.set(id, nowT); }
        }catch(e){}
        try{ return fn.apply(this, Array.prototype.slice.call(arguments,0)); }catch(e){}
      }, d);
    };
  }catch(e){}

  // simple helper to send a manual test event if a console command is called
  window.__ASYNC_LENS_TEST_EVENT = function(){ send({ id: genId('manual'), type: 'manual:test', timestamp: now(), payload: { msg: 'manual test' } }); };
})();
