// public/event-graph.js
// Dashboard logic with node creation fix and safer 3D handling

function startAsyncLensDashboard(wsUrl){
  // DOM
  const container2D = document.getElementById('network');
  const container3D = document.getElementById('graph3d');
  const eventsEl = document.getElementById('event-list');
  const inspectorEl = document.getElementById('inspector');
  const connIndicator = document.getElementById('connection-indicator');
  const requestsCountEl = document.getElementById('count-requests');
  const avgLatencyEl = document.getElementById('avg-latency');
  const entitiesCountEl = document.getElementById('count-entities');
  const filterInput = document.getElementById('filter-input');
  const typeFilter = document.getElementById('type-filter');
  const clearBtn = document.getElementById('clear-data');
  const saveBtn = document.getElementById('save-snapshot');
  const loadBtn = document.getElementById('load-snapshot');
  const playBtn = document.getElementById('play');
  const pauseBtn = document.getElementById('pause');
  const stepBackBtn = document.getElementById('step-back');
  const stepForwardBtn = document.getElementById('step-forward');
  const downloadBtn = document.getElementById('download-event');

  // vis 2D datasets
  const nodes = new vis.DataSet([]);
  const edges = new vis.DataSet([]);

  // 3D data model
  const nodes3d = [];
  const links3d = [];
  const nodeIndex3d = new Map();

  // index maps
  const entityToNode = new Map();   // entityId -> nodeId
  const events = [];

  // metrics
  let totalRequests = 0;
  let totalLatency = 0;
  const MAX_EVENTS = 10000;

  // replay state
  let replayIndex = -1;
  let isPlaying = false;
  let playTimer = null;
  const PLAY_INTERVAL_MS = 600;
  let selectedEvent = null;

  const CLUSTER_THRESHOLD = 400;
  let clustered = false;

  // Ensure containers have minimum size so vis/3D can initialize
  if (container2D) container2D.style.minHeight = container2D.style.minHeight || '360px';
  if (container3D) container3D.style.minHeight = container3D.style.minHeight || '360px';

  // create 2D network safely
  let network;
  try{
    network = new vis.Network(container2D, { nodes, edges }, {
      interaction: { hover: true, multiselect: false, zoomView: true },
      nodes: { shape: 'ellipse', color: { background: '#2a5d8f', border: '#0f2740', highlight: { background: '#6cc3ff', border: '#1b6ea8' } }, font: { color: '#fff', size: 12 }, margin: 6 },
      edges: { color: '#3b3f45', smooth: { type: 'dynamic' }, width: 1 },
      physics: { solver: 'forceAtlas2Based', forceAtlas2Based: { gravitationalConstant: -50, centralGravity: 0.01, springLength: 100, springConstant: 0.02 }, stabilization: { enabled: true, iterations: 150 } },
      layout: { improvedLayout: true }
    });
  }catch(e){
    console.error('vis network init failed', e);
  }

  // create 3D graph (hidden by default); detect library availability
  let Graph3D = null;
  let graph3dInstance = null;
  try {
    if (typeof ForceGraph3D === 'function') {
      Graph3D = ForceGraph3D;
      graph3dInstance = Graph3D()(container3D).graphData({ nodes: nodes3d, links: links3d }).nodeAutoColorBy('kind').nodeLabel(n => `${n.kind}\n${n.id}`).linkDirectionalParticles(0);
    }
  } catch (e) { console.warn('3D graph init failed', e); }

  const KIND_STYLE = { fetch: { color: '#27ae60' }, promise: { color: '#4f46e5' }, timer: { color: '#f59e0b' }, websocket: { color: '#9b5cf6' }, default: { color: '#6b7280' } };

  function shortId(id){ if (!id) return ''; return id.length > 12 ? id.slice(0,12) : id; }

  function ensureNode(entityOrId, rawEvent){
    // Accept either: { entityId, kind } or a plain id string
    try{
      const entityId = (entityOrId && entityOrId.entityId) ? entityOrId.entityId : (typeof entityOrId === 'string' ? entityOrId : null);
      if (!entityId) return null;
      if (entityToNode.has(entityId)) return entityToNode.get(entityId);
      const kind = (entityOrId && entityOrId.kind) || (rawEvent && rawEvent.type && rawEvent.type.split(':')[0]) || 'default';
      const id = entityId;
      const label = `${kind}\n${shortId(id)}`;
      try{ nodes.add({ id, label, title: `${kind} ${id}`, color: { background: KIND_STYLE[kind]?.color || KIND_STYLE.default.color, border: '#111827' }, font: { color: '#fff' }, value: 1 + Math.random() * 2 }); }catch(e){ /* ignore duplicate add errors */ }
      entityToNode.set(id, id);
      if (entitiesCountEl) entitiesCountEl.textContent = entityToNode.size;
      if (graph3dInstance && !nodeIndex3d.has(id)) {
        const n = { id, kind, val: 1 + Math.random() * 2, rawEvent };
        nodeIndex3d.set(id, nodes3d.length);
        nodes3d.push(n);
        refresh3D();
      }
      return id;
    }catch(e){ console.error('ensureNode error', e); return null; }
  }

  function addEdge(from, to){ if (!from || !to) return; const eid = `${from}->${to}:${Math.random().toString(36).slice(2,6)}`; try{ edges.add({ id: eid, from, to }); }catch(e){} if (graph3dInstance) { links3d.push({ source: from, target: to }); refresh3D(); } }

  function maybeCluster(){ try { if (nodes.length > CLUSTER_THRESHOLD && !clustered && network) { network.clusterByConnection(false, { clusterNodeProperties: { id: 'cluster-kind', label: 'Cluster', color: { background: '#374151' } } }); clustered = true; } }catch(e){} }

  function refresh3D(){ if (!graph3dInstance) return; try{ graph3dInstance.graphData({ nodes: nodes3d.slice(), links: links3d.slice() }); }catch(e){ console.warn('refresh3D failed', e); } }

  function renderEventLine(evt){ try{
      const el = document.createElement('div'); el.className = 'event-item'; el.dataset.eid = evt.id || ''; el.innerHTML = `<div class="meta"><span class="type ${evt.type}"></span><div class="title">${escapeHtml(displaySummary(evt))}</div><div class="ts">${new Date(evt.timestamp || evt.receivedAt).toLocaleTimeString()}</div></div>`; eventsEl.insertBefore(el, eventsEl.firstChild); el.addEventListener('click', () => { showInspector(evt); });
    }catch(e){ console.error('renderEventLine', e); }
  }

  function displaySummary(evt){ if (!evt) return ''; const t = evt.type || ''; if (evt.payload && evt.payload.request) return `${t}  ${evt.payload.request.url || evt.payload.request}`; if (evt.payload && evt.payload.msg) return `${t} ${String(evt.payload.msg)}`; return t || (evt.id||'event'); }
  function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function showInspector(evt){ try{
      inspectorEl.innerHTML = ''; if (!evt) { inspectorEl.textContent = 'Select a node or request to inspect'; return; } selectedEvent = evt; const header = document.createElement('div'); header.textContent = `${evt.type || evt.id || 'event'}`; header.style.fontWeight = '600'; inspectorEl.appendChild(header); const pre = document.createElement('pre'); pre.style.whiteSpace = 'pre-wrap'; pre.textContent = JSON.stringify(evt, null, 2); inspectorEl.appendChild(pre);
    }catch(e){ console.error('showInspector', e); }
  }

  function downloadSelectedEvent(){ if (!selectedEvent) return alert('No event selected'); const blob = new Blob([JSON.stringify(selectedEvent, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${selectedEvent.id || 'event'}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

  function updateMetrics(evt){ totalRequests++; if (requestsCountEl) requestsCountEl.textContent = totalRequests; let latency = evt.payload?.durationMs || evt.payload?.duration || 0; if (latency) { totalLatency += Number(latency); if (avgLatencyEl) avgLatencyEl.textContent = Math.round(totalLatency / totalRequests) + ' ms'; } }

  function passesFilter(evt){ try{ const q = (filterInput.value || '').trim().toLowerCase(); const typeSel = typeFilter.value; if (typeSel !== 'all' && !(evt.type||'').includes(typeSel)) return false; if (!q) return true; return (evt.type || '').toLowerCase().includes(q) || JSON.stringify(evt).toLowerCase().includes(q); }catch(e){ return true; } }

  function handleEvent(evt){
    try{
      if (!evt || !evt.id) return;
      events.push(evt);
      if (events.length > MAX_EVENTS) events.shift();
      updateMetrics(evt);

      // determine node id (prefer entity mapping)
      const nodeId = (evt.entity && evt.entity.entityId) ? evt.entity.entityId : evt.id;

      // ensure a visual node exists for this id
      if (!nodes.get(nodeId)){
        ensureNode(evt.entity || nodeId, evt);
      }

      // color / status updates
      const n = nodes.get(nodeId);
      if (evt.type === 'promise:resolve'){ if (n) nodes.update({ id: nodeId, color: { background: '#10b981', border: '#052e1f' }, value: Math.min(8, (n.value||1) + 1) }); }
      if (evt.type === 'promise:reject'){ if (n) nodes.update({ id: nodeId, color: { background: '#ef4444', border: '#2a0606' }, value: Math.min(8, (n.value||1) + 1) }); }

      if (evt.payload && evt.payload.durationMs) { const n2 = nodes.get(nodeId); if (n2) { const d = Number(evt.payload.durationMs); const color = d > 400 ? '#ef4444' : d > 150 ? '#f59e0b' : '#10b981'; nodes.update({ id: nodeId, color: { background: color } }); } }

      if (passesFilter(evt)) renderEventLine(evt);
      maybeCluster();
    }catch(e){ console.error('handleEvent error', e); }
  }

  const ws = new WebSocket(wsUrl);
  ws.onopen = () => { if (connIndicator) { connIndicator.className = 'conn connected'; connIndicator.textContent = 'Connected'; } console.log('Connected to collector ws', wsUrl); };
  ws.onmessage = (msg) => { try { const data = JSON.parse(msg.data); if (data.type === 'bootstrap' && Array.isArray(data.events)) data.events.forEach(e => handleEvent(e)); else if (data.type === 'event' && data.event) handleEvent(data.event); }catch(e){ console.error('ws msg parse', e); } };
  ws.onclose = () => { if (connIndicator) { connIndicator.className = 'conn disconnected'; connIndicator.textContent = 'Disconnected'; } console.log('ws closed'); };
  ws.onerror = (err) => { console.warn('ws error', err); };

  filterInput && filterInput.addEventListener('input', () => { eventsEl.innerHTML = ''; events.slice().reverse().forEach(e => { if (passesFilter(e)) renderEventLine(e); }); });
  typeFilter && typeFilter.addEventListener('change', () => { eventsEl.innerHTML = ''; events.slice().reverse().forEach(e => { if (passesFilter(e)) renderEventLine(e); }); });
  clearBtn && clearBtn.addEventListener('click', () => { events.length = 0; nodes.clear(); edges.clear(); entityToNode.clear(); eventsEl.innerHTML = ''; inspectorEl.innerHTML = 'Select a node or request to inspect'; entitiesCountEl.textContent = '0'; totalRequests = 0; totalLatency = 0; requestsCountEl.textContent = '0'; avgLatencyEl.textContent = '— ms'; });

  saveBtn && saveBtn.addEventListener('click', () => { fetch('/asynclens/snapshot', { method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ events: events.slice(-5000) }) }).then(r=>r.json()).then(j=>{ if (j && j.ok) alert('Snapshot saved: ' + j.name); else alert('Snapshot failed'); }).catch(e=>alert('Snapshot error')); });
  loadBtn && loadBtn.addEventListener('click', () => { fetch('/asynclens/events').then(r => r.json()).then(j => { const ev = j.events || []; ev.forEach(e => handleEvent(e)); alert('Loaded ' + ev.length + ' events'); }).catch(()=>alert('Load failed')); });

  // replay controls
  function startReplay(){ if (isPlaying) return; isPlaying = true; playTimer = setInterval(() => { stepForward(); }, PLAY_INTERVAL_MS); }
  function pauseReplay(){ if (!isPlaying) return; isPlaying = false; clearInterval(playTimer); playTimer = null; }
  function stepForward(){ if (replayIndex < events.length - 1) replayIndex++; const evt = events[replayIndex]; if (evt) { const nodeId = evt.entity?.entityId || evt.id; if (nodeId && nodes.get(nodeId)) { network.selectNodes([nodeId]); network.focus(nodeId, { scale: 1.6, animation: { duration: 200 } }); } const match = eventsEl.querySelector(`[data-eid="${evt.id}"]`); if (match) { match.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); match.classList.add('highlight'); setTimeout(()=>match.classList.remove('highlight'), 900); } showInspector(evt); } }
  function stepBack(){ if (replayIndex > 0) replayIndex--; const evt = events[replayIndex]; if (evt) { const nodeId = evt.entity?.entityId || evt.id; if (nodeId && nodes.get(nodeId)) { network.selectNodes([nodeId]); network.focus(nodeId, { scale: 1.6, animation: { duration: 200 } }); } showInspector(evt); } }

  playBtn && playBtn.addEventListener('click', startReplay); pauseBtn && pauseBtn.addEventListener('click', pauseReplay); stepForwardBtn && stepForwardBtn.addEventListener('click', stepForward); stepBackBtn && stepBackBtn.addEventListener('click', stepBack);

  network && network.on('selectNode', (params) => { const nodeId = params.nodes && params.nodes[0]; if (!nodeId) return; const last = [...events].reverse().find(e => (e.entity && e.entity.entityId === nodeId) || e.id === nodeId); if (last) showInspector(last); });

  window.addEventListener('resize', () => { try{ network && network.redraw(); if (graph3dInstance) graph3dInstance.width(container3D.clientWidth).height(container3D.clientHeight); }catch(e){} });

  inspectorEl.textContent = 'Waiting for events...';
}
