// extension/content-injector.js
// Injects the extension-hosted instrumentation into the page and forwards window.postMessage events to background

(function(){
  const scriptUrl = chrome.runtime.getURL('instrumentation.js');
  try {
    const s = document.createElement('script');
    s.src = scriptUrl;
    s.type = 'text/javascript';
    s.crossOrigin = 'anonymous';
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {
    console.warn('AsyncLens: failed to inject script', e);
  }

  window.addEventListener('message', (ev) => {
    try {
      if (ev.source !== window) return;
      const payload = ev.data;
      if (!payload || payload.__AsyncLensEvent !== true) return;
      chrome.runtime.sendMessage({ type: 'asynclens_event', event: payload.event });
    } catch (e) { }
  });
})();
