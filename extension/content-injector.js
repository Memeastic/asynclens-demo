// extension/content-injector.js
// Runs in the extension content-script context and injects two scripts into every page:
// 1) an inline script that sets window.__ASYNCLENS_COLLECTOR__ to the configured collector URL
// 2) a script tag that loads the instrumentation script (by default from http://localhost:3000/instrumentation.js)

(function(){
  // default configuration
  const DEFAULT_COLLECTOR = 'http://localhost:3000/asynclens/events';
  const DEFAULT_SCRIPT = 'http://localhost:3000/instrumentation.js';

  try {
    // read settings from chrome.storage (if the user saved custom values in the options page)
    chrome.storage && chrome.storage.sync && chrome.storage.sync.get(['collector','scriptSrc'], (res) => {
      const collectorUrl = (res && res.collector) ? res.collector : DEFAULT_COLLECTOR;
      const scriptSrc = (res && res.scriptSrc) ? res.scriptSrc : DEFAULT_SCRIPT;
      inject(collectorUrl, scriptSrc);
    });
  } catch (e) {
    // fallback: inject defaults
    inject(DEFAULT_COLLECTOR, DEFAULT_SCRIPT);
  }

  function inject(collectorUrl, scriptSrc){
    try {
      // 1) inline script to set collector URL before instrumentation loads
      const inline = document.createElement('script');
      inline.type = 'text/javascript';
      inline.textContent = `window.__ASYNCLENS_COLLECTOR__ = ${JSON.stringify(collectorUrl)};`;
      (document.documentElement || document.head || document.body || document).appendChild(inline);

      // 2) script tag to load instrumentation
      const s = document.createElement('script');
      s.type = 'text/javascript';
      s.src = scriptSrc;
      s.crossOrigin = 'anonymous';
      s.onload = function(){
        // remove script tags if you want to keep the page clean
        try { inline.remove(); } catch(e){}
        try { s.remove(); } catch(e){}
      };
      (document.documentElement || document.head || document.body || document).appendChild(s);
    } catch (err) {
      // silently fail — instrumentation should be non-blocking
      try { console.warn('AsyncLens injector failed:', err); } catch(_){}
    }
  }
})();
