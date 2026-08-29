// extension/background.js
// Receives forwarded events from the content script and posts them to the collector URL stored in sync storage.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try{
    if (!msg || msg.type !== 'asynclens_event' || !msg.event) return;
    chrome.storage && chrome.storage.sync && chrome.storage.sync.get(['collector'], (res) => {
      const url = (res && res.collector) ? res.collector : 'http://localhost:3000/asynclens/events';
      try{
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg.event) }).catch(()=>{});
      }catch(e){}
    });
  }catch(e){ }
});
