// extension/instrumentation.js
// Minimal embedded AsyncLens instrumentation for extension use.
// This script runs in the page context. It posts events to the page via window.postMessage
// which the content script forwards to the extension background to actually POST to the collector.

(function AsyncLensEmbedded(){
  // determine collector from query param on our script tag or from window.__ASYNCLENS_COLLECTOR
  function collectorFromScript(){
    try{
      const src = document.currentScript && document.currentScript.src || '';
      const m = src.match(/[?&]collector=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    }catch(e){}
    return null;
  }
  const collectorUrl = window.__ASYNCLENS_COLLECTOR || collectorFromScript() || '/asynclens/events';

  window.AsyncLens = window.AsyncLens || {};
  window.AsyncLens.config = window.AsyncLens.config || { redactKeys: ['authorization','cookie','set-cookie','password'] };

  function genId(prefix='id'){ return prefix + ':' + Math.random().toString(36).slice(2,10); }

  function safeStringify(obj, limit = 1000){ try { const s = JSON.stringify(obj); return s.length > limit ? s.slice(0, limit) + '...<truncated>' : s; } catch(e){ try { return String(obj).slice(0, limit); } catch(_) { return '' } } }

  function redact(obj){
    try{
      const keys = (window.AsyncLens && window.AsyncLens.config && window.AsyncLens.config.redactKeys) || [];
      if (!obj || typeof obj !== 'object') return obj;
      const copy = Array.isArray(obj) ? obj.slice() : Object.assign({}, obj);
      Object.keys(copy).forEach(k => {
        try{
          if (keys.includes(k.toLowerCase())) copy[k] = '<redacted>';
          else if (typeof copy[k] === 'object') copy[k] = redact(copy[k]);
        }catch(e){}
      });
      return copy;
    }catch(e){ return obj; }
  }

  function safeSend(event){
    try {
      event.timestamp = Date.now();
      if (event.payload && typeof event.payload === 'object') event.payload = redact(event.payload);
      // Post to the page; content script will forward to background
      window.postMessage({ __AsyncLensEvent: true, event }, '*');
    } catch(e){ try { console.warn('AsyncLens send error', e); } catch(_) {} }
  }

  window.AsyncLens.send = safeSend;
  window.AsyncLens.genId = genId;

  // Basic instrumentation: wrap fetch to emit start/end events
  try{
    const origFetch = window.fetch;
    if (typeof origFetch === 'function'){
      window.fetch = function(input, init){
        const id = genId('fetch');
        const url = (typeof input === 'string') ? input : (input && input.url) || '';
        safeSend({ id, type: 'fetch:start', payload: { request: url } });
        const start = Date.now();
        return origFetch.apply(this, arguments).then(res => {
          const duration = Date.now() - start;
          // try to read text (non-blocking)
          try { res.clone().text().then(t => { safeSend({ id, type: 'fetch:end', payload: { status: res.status, durationMs: duration, data: safeStringify(t, 200) } }); }).catch(()=>{ safeSend({ id, type: 'fetch:end', payload: { status: res.status, durationMs: duration } }); }); } catch(e){ safeSend({ id, type: 'fetch:end', payload: { status: res.status, durationMs: duration } }); }
          return res;
        }).catch(err => { safeSend({ id, type: 'fetch:error', payload: { message: String(err) } }); throw err; });
      };
    }
  }catch(e){ /* ignore */ }

  // simple timer instrumentation example
  try{
    const origSetTimeout = window.setTimeout;
    window.setTimeout = function(fn, delay){
      const id = genId('timer');
      const args = Array.prototype.slice.call(arguments, 2);
      return origSetTimeout(function(){ safeSend({ id, type: 'timer:callback', payload: { delay } }); try{ fn.apply(this, args); }catch(e){} }, delay);
    };
  }catch(e){}

})();
