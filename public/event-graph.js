// public/event-graph.js
// Enhanced dashboard logic: graph + 3D view + event list + inspector + metrics + clustering + snapshot UI

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
  const toggle3DBtn = document.getElementById('toggle-3d');
  const saveBtn = document.getElementById('save-snapshot');
  const loadBtn = document.getElementById('load-snapshot');

  // vis 2D datasets
  const nodes = new vis.DataSet([]);
  const edges = new vis.DataSet([]);

  // 3D data model
  const nodes3d = [];
  const links3d = [];
  const nodeIndex3d = new Map();

  // index maps
  const entityToNode = new Map();   // entityId -> nodeId
  const events = [];                // circular buffer-like

  // metrics
  let totalRequests = 0;
  let totalLatency = 0;
  const MAX_EVENTS = 5000;

  // clustering threshold
  const CLUSTER_THRESHOLD = 200;
  let clustered = false;

  // create 2D network
  const network = new vis.Network(container2D, { nodes, edges }, {
    interaction: { hover: true, multiselect: false, zoomView: true },
    nodes: {
      shape: 'ellipse',
      color: {
        background: '#2a5d8f',
        border: '#0f2740',
        highlight: { background: '#6cc3ff', border: '#1b6ea8' }
      },
      font: { color: '#fff', size: 12, face: 'Inter, system-ui' },
      margin: 6
    },
    edges: {
      color: '#3b3f45',
      smooth: { type: 'dynamic' },
      width: 1
    },
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: { gravitationalConstant: -50, centralGravity: 0.01, springLength: 100, springConstant: 0.02 },
      stabilization: { enabled: true, iterations: 500 }
    },
    layout: { improvedLayout: true }
  });

  // create 3D graph (hidden by default)
  let Graph3D = null;
  try {
    if (typeof ForceGraph3D === 'function') {
      Graph3D = ForceGraph3D()(container3D)
        .graphData({ nodes: nodes3d, links: links3d })
        .nodeAutoColorBy('kind')
        .nodeLabel(n => `${n.kind}\n${n.id}`)
        .linkDirectionalParticles(0)
        .onNodeClick(node => {
          if (nodes.get(node.id)) {
            network.selectNodes([node.id]);
            network.focus(node.id, { scale: 1.4, animation: { duration: 300 } });
          }
          showInspector(node.rawEvent || { id: node.id });
        });
    }
  } catch (e) {
    console.warn('3D graph init failed', e);
  }

  // color mapping
  const KIND_STYLE = {
    fetch: { color: '#27ae60' },    // green
    promise: { color: '#4f46e5' },  // indigo
    timer: { color: '#f59e0b' },    // amber
    websocket: { color: '#9b5cf6' },// purple
    default: { color: '#6b7280' }   // gray
  };

  // helper: ensure node exists for an entity
  function ensureNode(entity, rawEvent){
    if (!entity || !entity.entityId) return null;
    if (entityToNode.has(entity.entityId)) return entityToNode.get(entity.entityId);
    const id = entity.entityId;
    const kind = entity.kind || 'default';
    const label = `${kind}\n${shortId(id)}`;
    nodes.add({ id, label, title: `${kind} ${id}`, color: { background: KIND_STYLE[kind]?.color || KIND_STYLE.default.color, border: '#111827' }, font: { color: '#fff' }, value: 1 + Math.random() * 2 });
    entityToNode.set(id, id);
    entitiesCountEl.textContent = entityToNode.size;

    // add to 3d model
    if (Graph3D) {
      if (!nodeIndex3d.has(id)) {
        const n = { id, kind, val: 1 + Math.random() * 2, rawEvent };
        nodeIndex3d.set(id, nodes3d.length);
        nodes3d.push(n);
        refresh3D();
      }
    }
    return id;
  }

  // helper: add edge
  function addEdge(from, to){
    if (!from || !to) return;
    const eid = `${from}->${to}:${Math.random().toString(36).slice(2,6)}`;
    edges.add({ id: eid, from, to });
    // 3D
    if (Graph3D) {
      links3d.push({ source: from, target: to, id: eid });
      refresh3D();
    }
  }

  // clustering: group by kind when nodes exceed threshold
  function maybeCluster(){
    try {
      if (nodes.length > CLUSTER_THRESHOLD && !clustered) {
        network.clusterByConnection(false, { clusterNodeProperties: { id: 'cluster-kind', label: 'Cluster', color: { background: '#111827' } } });
        clustered = true;
      } else if (nodes.length <= CLUSTER_THRESHOLD && clustered) {
        network.openCluster('cluster-kind');
        clustered = false;
      }
    } catch(e){ /* ignore clustering errors */ }
  }

  // update 3D graph data
  function refresh3D(){
    if (!Graph3D) return;
    Graph3D.graphData({ nodes: nodes3d.slice(), links: links3d.slice() });
  }

  // short id helper
  function shortId(id){
    if (!id) return '';
    return id.length > 12 ? id.slice(0,12) : id;
  }

  // render event list item
  function renderEventLine(evt){
    const el = document.createElement('div');
    el.className = 'event-item';
    el.dataset.eid = evt.id || '';
    el.innerHTML = `<div class="meta"><span class="type ${evt.type||''}">${(evt.type||'').split(':')[0]}</span><span class="time">${new Date(evt.timestamp).toLocaleTimeString()}</span></div><div class="body">${escapeHtml(displaySummary(evt))}</div>`;
    el.addEventListener('click', () => {
      showInspector(evt);
      const nodeId = evt.entity?.entityId || evt.id;
      if (nodeId && nodes.get(nodeId)) { network.selectNodes([nodeId]); network.focus(nodeId, { scale: 1.4, animation: { duration: 300 } }); }
      if (Graph3D && nodeIndex3d.has(nodeId)) { const idx = nodeIndex3d.get(nodeId); const n = nodes3d[idx]; if (n) Graph3D.centerAt(n.x || 0, n.y || 0, 1000, 300); }
    });
    eventsEl.insertBefore(el, eventsEl.firstChild);
    while (eventsEl.children.length > 500) eventsEl.removeChild(eventsEl.lastChild);
  }

  // summary string for list
  function displaySummary(evt){
    if (!evt) return '';
    const t = evt.type || '';
    if (evt.payload && evt.payload.request) return `${t}  ${evt.payload.request}`;
    if (evt.payload && evt.payload.status) return `${t}  status:${evt.payload.status}`;
    if (evt.entity && evt.entity.entityId) return `${t} ${evt.entity.entityId}`;
    return t;
  }

  // escape simple
  function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // inspector (richer)
  function showInspector(evt){
    inspectorEl.innerHTML = '';
    if (!evt) { inspectorEl.textContent = 'Select a node or request to inspect'; return; }

    const header = document.createElement('div'); header.className = 'inspector-header-top';
    header.innerHTML = `<strong>${escapeHtml(evt.type || evt.entity?.kind || evt.id || 'Event')}</strong> <span class="muted">${new Date(evt.timestamp).toLocaleString()}</span>`;
    inspectorEl.appendChild(header);

    const tabs = document.createElement('div'); tabs.className = 'inspector-tabs';
    const tabGen = document.createElement('button'); tabGen.textContent = 'General'; tabGen.className = 'tab active';
    const tabRaw = document.createElement('button'); tabRaw.textContent = 'Raw JSON'; tabRaw.className = 'tab';
    tabs.appendChild(tabGen); tabs.appendChild(tabRaw);
    inspectorEl.appendChild(tabs);

    const paneGen = document.createElement('div'); paneGen.className = 'inspector-pane';
    const infoList = document.createElement('dl'); infoList.className = 'inspector-list';
    function addRow(k,v){ const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; infoList.appendChild(dt); infoList.appendChild(dd); }
    addRow('Type', evt.type || '');
    addRow('Entity', evt.entity?.entityId || '');
    if (evt.payload && evt.payload.status) addRow('Status', evt.payload.status);
    if (evt.payload && (evt.payload.durationMs || evt.payload.duration)) addRow('Duration', `${evt.payload.durationMs || evt.payload.duration} ms`);
    if (evt.payload && evt.payload.request) addRow('Request', evt.payload.request);
    paneGen.appendChild(infoList);

    const paneRaw = document.createElement('pre'); paneRaw.className = 'inspector-raw'; paneRaw.textContent = JSON.stringify(evt, null, 2);

    inspectorEl.appendChild(paneGen);
    inspectorEl.appendChild(paneRaw);

    // tab logic
    tabGen.addEventListener('click', () => { tabGen.classList.add('active'); tabRaw.classList.remove('active'); paneGen.style.display='block'; paneRaw.style.display='none'; });
    tabRaw.addEventListener('click', () => { tabRaw.classList.add('active'); tabGen.classList.remove('active'); paneRaw.style.display='block'; paneGen.style.display='none'; });
    paneRaw.style.display='none';
  }

  // update metrics
  function updateMetrics(evt){
    totalRequests++;
    requestsCountEl.textContent = totalRequests;
    let latency = evt.payload?.durationMs || evt.payload?.duration || 0;
    if (latency) { totalLatency += Number(latency); const avg = Math.round(totalLatency / totalRequests); avgLatencyEl.textContent = `${avg} ms`; }
  }

  // apply filters when adding an event
  function passesFilter(evt){
    const q = filterInput.value.trim().toLowerCase();
    const typeSel = typeFilter.value;
    if (typeSel !== 'all' && !(evt.type||'').includes(typeSel)) return false;
    if (!q) return true;
    if ((evt.payload?.request||'').toLowerCase().includes(q)) return true;
    if ((evt.type||'').toLowerCase().includes(q)) return true;
    if ((evt.entity?.entityId||'').toLowerCase().includes(q)) return true;
    return false;
  }

  // main event handler
  function handleEvent(evt){
    if (!evt || !evt.id) return;
    events.push(evt);
    if (events.length > MAX_EVENTS) events.shift();

    updateMetrics(evt);

    const nodeId = evt.entity?.entityId || evt.id;
    const kind = evt.entity?.kind || (evt.type ? evt.type.split(':')[0] : 'default');

    if (evt.entity) ensureNode(evt.entity, evt);

    if (Array.isArray(evt.parentIds) && evt.parentIds.length) {
      evt.parentIds.forEach(pid => {
        if (!nodes.get(pid)) nodes.add({ id: pid, label: shortId(pid), color: { background: '#374151' }, font: { color: '#fff' } });
        addEdge(pid, nodeId);
      });
    }

    if (evt.payload && evt.payload.durationMs) {
      const n = nodes.get(nodeId);
      if (n) { const d = Number(evt.payload.durationMs); const color = d > 400 ? '#ef4444' : d > 150 ? '#f59e0b' : '#10b981'; nodes.update({ id: nodeId, color: { background: color, border: '#0f172a' }, value: Math.min(8, 1 + d / 80) }); }
      if (nodeIndex3d.has(nodeId)) { const idx = nodeIndex3d.get(nodeId); nodes3d[idx].val = Math.min(8, 1 + Number(evt.payload.durationMs) / 80); }
    }

    if (passesFilter(evt)) renderEventLine(evt);

    maybeCluster();
  }

  // websocket connect
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => { connIndicator.className = 'conn connected'; connIndicator.textContent = 'Connected'; console.log('Connected to collector ws', wsUrl); };
  ws.onmessage = (msg) => {
    try { const data = JSON.parse(msg.data); if (data.type === 'bootstrap' && Array.isArray(data.events)) data.events.forEach(e => handleEvent(e)); else if (data.type === 'event' && data.event) handleEvent(data.event); refresh3D(); } catch (e) { console.warn('bad ws message', e); }
  };
  ws.onclose = () => { connIndicator.className = 'conn disconnected'; connIndicator.textContent = 'Disconnected'; console.log('ws closed'); };
  ws.onerror = (err) => { console.warn('ws error', err); };

  // UI: hooking up filters and controls
  filterInput.addEventListener('input', () => { eventsEl.innerHTML = ''; events.slice().reverse().forEach(e => { if (passesFilter(e)) renderEventLine(e); }); });
  typeFilter.addEventListener('change', () => filterInput.dispatchEvent(new Event('input')));
  clearBtn.addEventListener('click', () => { events.length = 0; nodes.clear(); edges.clear(); entityToNode.clear(); eventsEl.innerHTML = ''; inspectorEl.innerHTML = 'Select a node or request to inspect'; totalRequests = 0; totalLatency = 0; requestsCountEl.textContent = '0'; avgLatencyEl.textContent = '— ms'; entitiesCountEl.textContent = '0'; nodes3d.length = 0; links3d.length = 0; nodeIndex3d.clear(); refresh3D(); });

  // snapshot save/load
  saveBtn.addEventListener('click', () => {
    fetch('/asynclens/snapshot', { method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ events: events.slice(-1000) }) }).then(r => r.json()).then(j => { alert('Snapshot saved: ' + (j.name || 'ok')); }).catch(e => alert('Save failed: ' + e));
  });
  loadBtn.addEventListener('click', () => {
    fetch('/asynclens/events').then(r => r.json()).then(j => { const ev = j.events || []; ev.forEach(e => handleEvent(e)); alert('Loaded ' + ev.length + ' events'); }).catch(e => alert('Load failed: ' + e));
  });

  // 3D toggle
  let showing3D = false;
  toggle3DBtn.addEventListener('click', () => {
    showing3D = !showing3D;
    if (showing3D) { container2D.style.display = 'none'; container3D.style.display = 'block'; toggle3DBtn.classList.add('active'); if (Graph3D) Graph3D.pauseAnimation(0); refresh3D(); } else { container3D.style.display = 'none'; container2D.style.display = 'block'; toggle3DBtn.classList.remove('active'); }
  });

  // hook node select to inspector
  network.on('selectNode', (params) => {
    const nodeId = params.nodes && params.nodes[0]; if (!nodeId) return; const last = [...events].reverse().find(e => (e.entity && e.entity.entityId === nodeId) || e.id === nodeId); if (last) showInspector(last); else showInspector({ id: nodeId, info: 'Node selected' });
  });

  // small helper to keep canvas sized
  window.addEventListener('resize', () => { network.redraw(); if (Graph3D) Graph3D.width(container3D.clientWidth).height(container3D.clientHeight); });

  inspectorEl.textContent = 'Waiting for events...';
}
