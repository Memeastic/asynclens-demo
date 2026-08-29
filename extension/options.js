// extension/options.js
const collectorEl = document.getElementById('collector');
const scriptEl = document.getElementById('scriptSrc');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

const DEFAULT_COLLECTOR = 'http://localhost:3000/asynclens/events';
const DEFAULT_SCRIPT = 'http://localhost:3000/instrumentation.js';

// load existing
chrome.storage.sync.get(['collector','scriptSrc'], (res) => {
  collectorEl.value = res && res.collector ? res.collector : DEFAULT_COLLECTOR;
  scriptEl.value = res && res.scriptSrc ? res.scriptSrc : DEFAULT_SCRIPT;
});

saveBtn.addEventListener('click', () => {
  const c = collectorEl.value.trim() || DEFAULT_COLLECTOR;
  const s = scriptEl.value.trim() || DEFAULT_SCRIPT;
  chrome.storage.sync.set({ collector: c, scriptSrc: s }, () => {
    statusEl.textContent = 'Saved.';
    setTimeout(() => statusEl.textContent = '', 2000);
  });
});
