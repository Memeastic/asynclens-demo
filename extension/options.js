// extension/options.js
const eventsEl = document.getElementById('events');
const inspectorEl = document.getElementById('inspector');
const clearBtn = document.getElementById('clear');
const exportBtn = document.getElementById('export');
const testBtn = document.getElementById('test');

function renderEvents(list){
  eventsEl.innerHTML = '';
  if (!list || list.length === 0) { eventsEl.textContent = 'No events collected yet.'; return; }
  list.forEach(ev => {
    const d = document.createElement('div'); d.className = 'ev';
    d.innerHTML = `<div style="font-weight:600">${ev.type || ev.id}</div><div style="font-size:12px;color:#9fb0c8">${new Date(ev.timestamp||ev.receivedAt).toLocaleString()}</div><pre>${JSON.stringify(ev.payload||{},null,2)}</pre>`;
    d.addEventListener('click', ()=>{ inspectorEl.textContent = ''; const pre = document.createElement('pre'); pre.textContent = JSON.stringify(ev,null,2); inspectorEl.appendChild(pre); });
    eventsEl.appendChild(d);
  });
}

function load(){ chrome.storage.local.get(['events'], (res) => { const arr = Array.isArray(res.events) ? res.events : []; renderEvents(arr); }); }

clearBtn.addEventListener('click', ()=>{ chrome.storage.local.set({ events: [] }, ()=> load()); });
exportBtn.addEventListener('click', ()=>{ chrome.storage.local.get(['events'], (res)=>{ const data = JSON.stringify(res.events||[], null, 2); const blob = new Blob([data], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download='asynclens-events.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }); });

testBtn.addEventListener('click', ()=>{ // call in-page helper if present
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: () => { if (window.__ASYNC_LENS_TEST_EVENT) { window.__ASYNC_LENS_TEST_EVENT(); return true; } return false; } }, (res) => { setTimeout(load, 300); });
  });
});

// refresh periodically
setInterval(load, 1000);
load();
