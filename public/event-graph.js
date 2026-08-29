// public/event-graph.js
// Enhanced dashboard logic: graph + 3D view + event list + inspector + stats

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
  const MAX_EVENTS = 2000;

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
      stabilization: { enabled: true, iterations: 1000 }
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
          // focus in 2D as well
          if (nodes.get(node.id)) {
            network.selectNodes([node.id]);
            network.focus(node.id, { scale: 1.4, animation: { duration: 300 } });
          }
          // show inspector
          showInspector(node.rawEvent || { id: node.id });
        })
        .onNodeHover(node => {
          // simple hover action
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
    nodes.add({
      id,
      label,
      title: `${kind} ${id}`,
      color: { background: KIND_STYLE[kind]?.color || KIND_STYLE.default.color, border: '#111827' },
      font: { color: '#fff' },
      value: 1 + Math.random() * 2
    });
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

  // update 3D graph data
  function refresh3D(){
    if (!Graph3D) return;
    // give copy to avoid mutation issues
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
    el.innerHTML = `<div class="meta">
                      <span class="type ${evt.type||''}">${(evt.type||'').split(':')[0]}</span>
                      <span class="time">${new Date(evt.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div class="body">${escapeHtml(displaySummary(evt))}</div>`;
    // click -> show inspector and focus node
    el.addEventListener('click', () => {
      showInspector(evt);
      // highlight related node if present
      const nodeId = evt.entity?.entityId || evt.id;
      if (nodeId && nodes.get(nodeId)) {
        network.selectNodes([nodeId]);
        network.focus(nodeId, { scale: 1.4, animation: { duration: 300 } });
      }
      // also rotate 3d camera toward node if present
      if (Graph3D && nodeIndex3d.has(nodeId)) {
        const idx = nodeIndex3d.get(nodeId);
        const n = nodes3d[idx];
        Graph3D.centerAt(n.x || 0, n.y || 0, 1000, 300);
      }
    });
    eventsEl.insertBefore(el, eventsEl.firstChild);
    // keep list size sane
    while (eventsEl.children.length > 300) eventsEl.removeChild(eventsEl.lastChild);
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

  // inspector
  function showInspector(evt){
    inspectorEl.innerHTML = '';
    if (!evt) { inspectorEl.textContent = 'Select a node or request to inspect'; return; }
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(evt, null, 2);
    inspectorEl.appendChild(pre);
  }

  // update metrics
  function updateMetrics(evt){
    // count and latency (if payload.durationMs or payload.duration)
    totalRequests++;
    requestsCountEl.textContent = totalRequests;
    let latency = evt.payload?.durationMs || evt.payload?.duration || 0;
    if (latency) {
      totalLatency += Number(latency);
      const avg = Math.round(totalLatency / totalRequests);
      avgLatencyEl.textContent = `${avg} ms`;
    }
  }

  // apply filters when adding an event
  function passesFilter(evt){
    const q = filterInput.value.trim().toLowerCase();
    const typeSel = typeFilter.value;
    if (typeSel !== 'all' && !(evt.type||'').includes(typeSel)) return false;
    if (!q) return true;
    // check request url or payload or type
    if ((evt.payload?.request||'').toLowerCase().includes(q)) return true;
    if ((evt.type||'').toLowerCase().includes(q)) return true;
    if ((evt.entity?.entityId||'').toLowerCase().includes(q)) return true;
    return false;
  }

  // main event handler
  function handleEvent(evt){
    // ensure id and timestamp
    if (!evt || !evt.id) return;
    // maintain local buffer
    events.push(evt);
    if (events.length > MAX_EVENTS) events.shift();

    // metrics
    updateMetrics(evt);

    // nodes & edges
    const nodeId = evt.entity?.entityId || evt.id;
    const kind = evt.entity?.kind || (evt.type ? evt.type.split(':')[0] : 'default');

    // create/ensure node
    if (evt.entity) ensureNode(evt.entity, evt);

    // link parentIds if provided
    if (Array.isArray(evt.parentIds) && evt.parentIds.length) {
      evt.parentIds.forEach(pid => {
        // ensure parent node exists as a lightweight node
        if (!nodes.get(pid)) {
          nodes.add({ id: pid, label: shortId(pid), color: { background: '#374151' }, font: { color: '#fff' } });
          // 3d
          if (Graph3D && !nodeIndex3d.has(pid)) {
            nodeIndex3d.set(pid, nodes3d.length);
            nodes3d.push({ id: pid, kind: 'parent' });
          }
        }
        addEdge(pid, nodeId);
      });
    }

    // mark node size and color based on timings if present
    if (evt.payload && evt.payload.durationMs) {
      const n = nodes.get(nodeId);
      if (n) {
        const d = Number(evt.payload.durationMs);
        const color = d > 400 ? '#ef4444' : d > 150 ? '#f59e0b' : '#10b981';
        nodes.update({ id: nodeId, color: { background: color, border: '#0f172a' }, value: Math.min(6, 1 + d / 100) });
      }
      // 3d node size
      if (nodeIndex3d.has(nodeId)) {
        const idx = nodeIndex3d.get(nodeId);
        nodes3d[idx].val = Math.min(6, 1 + Number(evt.payload.durationMs) / 100);
      }
    }

    // add to visual list if passes filter
    if (passesFilter(evt)) renderEventLine(evt);
  }

  // websocket connect
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => {
    connIndicator.className = 'conn connected';
    connIndicator.textContent = 'Connected';
    console.log('Connected to collector ws', wsUrl);
  };
  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.type === 'bootstrap' && Array.isArray(data.events)) {
        data.events.forEach(e => handleEvent(e));
      } else if (data.type === 'event' && data.event) {
        handleEvent(data.event);
      }
      // refresh 3D if needed
      refresh3D();
    } catch (e) { console.warn('bad ws message', e); }
  };
  ws.onclose = () => {
    connIndicator.className = 'conn disconnected';
    connIndicator.textContent = 'Disconnected';
    console.log('ws closed');
  };
  ws.onerror = (err) => { console.warn('ws error', err); };

  // UI: hooking up filters and controls
  filterInput.addEventListener('input', () => {
    // rebuild visible list (clear and re-render from events with filter)
    eventsEl.innerHTML = '';
    events.slice().reverse().forEach(e => { if (passesFilter(e)) renderEventLine(e); });
  });
  typeFilter.addEventListener('change', () => filterInput.dispatchEvent(new Event('input')));
  clearBtn.addEventListener('click', () => {
    // clear local state
    events.length = 0;
    nodes.clear();
    edges.clear();
    entityToNode.clear();
    eventsEl.innerHTML = '';
    inspectorEl.innerHTML = 'Select a node or request to inspect';
    totalRequests = 0; totalLatency = 0;
    requestsCountEl.textContent = '0';
    avgLatencyEl.textContent = '— ms';
    entitiesCountEl.textContent = '0';
    // clear 3d
    nodes3d.length = 0; links3d.length = 0; nodeIndex3d.clear();
    refresh3D();
  });

  // 3D toggle
  let showing3D = false;
  toggle3DBtn.addEventListener('click', () => {
    showing3D = !showing3D;
    if (showing3D) {
      container2D.style.display = 'none';
      container3D.style.display = 'block';
      toggle3DBtn.classList.add('active');
      if (Graph3D) Graph3D.pauseAnimation(0);
      refresh3D();
    } else {
      container3D.style.display = 'none';
      container2D.style.display = 'block';
      toggle3DBtn.classList.remove('active');
    }
  });

  // hook node select to inspector
  network.on('selectNode', (params) => {
    const nodeId = params.nodes && params.nodes[0];
    if (!nodeId) return;
    // find last event for this entity
    const last = [...events].reverse().find(e => (e.entity && e.entity.entityId === nodeId) || e.id === nodeId);
    if (last) showInspector(last);
    else showInspector({ id: nodeId, info: 'Node selected' });
  });

  // small helper to keep canvas sized
  window.addEventListener('resize', () => { network.redraw(); if (Graph3D) Graph3D.width(container3D.clientWidth).height(container3D.clientHeight); });

  // initial message in inspector
  inspectorEl.textContent = 'Waiting for events...';
}
