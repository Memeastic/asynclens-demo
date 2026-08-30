// extension/background.js
// Background service worker receives events from the content script and stores them in chrome.storage.local

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    if (!msg || msg.type !== 'asynclens_event' || !msg.event) return;
    const ev = msg.event;
    // read existing events and prepend
    chrome.storage.local.get(['events'], (res) => {
      const arr = Array.isArray(res.events) ? res.events : [];
      arr.unshift(ev);
      // cap stored events
      const MAX = 5000;
      if (arr.length > MAX) arr.length = MAX;
      chrome.storage.local.set({ events: arr }, () => {
        // update badge count (limited)
        try { const count = Math.min(arr.length, 9999).toString(); chrome.action.setBadgeText({ text: count }); chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' }); } catch(e){}
      });
    });
  } catch (e) {}
});

// Provide a simple one-time initializer to clear badge if none
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});
