// extension/content-injector.js
// Inject extension-hosted instrumentation into the page and forward page-posted events to the extension background script.

(function(){
  const DEFAULT_COLLECTOR = 'http://localhost:3000/asynclens/events';

  function injectScriptWithCollector(collectorUrl){
    try{
      const scriptUrl = chrome.runtime.getURL('instrumentation.js') + '?collector=' + encodeURIComponent(collectorUrl || DEFAULT_COLLECTOR);
      const s = document.createElement('script');
      s.type = 'text/javascript';
      s.src = scriptUrl;
      s.crossOrigin = 'anonymous';
      (document.documentElement || document.head || document.body || document).appendChild(s);
    }catch(e){ console.warn('AsyncLens injector failed', e); }
  }

  try{
    chrome.storage && chrome.storage.sync && chrome.storage.sync.get(['collector','scriptSrc'], (res) => {
      const collectorUrl = (res && res.collector) ? res.collector : DEFAULT_COLLECTOR;
      injectScriptWithCollector(collectorUrl);
    });
  }catch(e){ injectScriptWithCollector(DEFAULT_COLLECTOR); }

  // Listen for events posted from the page (by the instrumentation) and forward them to the background service worker
  window.addEventListener('message', (ev) => {
    try{
      if (ev.source !== window) return;
      const payload = ev.data;
      if (!payload || payload.__AsyncLensEvent !== true) return;
      // forward to background
      chrome.runtime.sendMessage({ type: 'asynclens_event', event: payload.event });
    }catch(e){ /* ignore */ }
  });
})();
