// Dashboard logic: connect to websocket and render a simple graph with vis-network
function startAsyncLensDashboard(wsUrl){
  const container = document.getElementById('network');
  const eventsEl = document.getElementById('events');

  const nodes = new vis.DataSet([]);
  const edges = new vis.DataSet([]);

  const network = new vis.Network(container, { nodes, edges }, {
    physics: { stabilization: true },
    layout: { improvedLayout: true },
    edges: { arrows: { to: false } }
  });

  // Map entityId -> nodeId
  const entityToNode = new Map();
  // Keep recent events list
  const recent = [];

  function renderEventLine(evt){
    const el = document.createElement('div');
    el.textContent = `${new Date(evt.timestamp).toLocaleTimeString()}  ${evt.type}  ${evt.entity && evt.entity.entityId ? evt.entity.entityId : evt.id}`;
    eventsEl.insertBefore(el, eventsEl.firstChild);
    while (eventsEl.children.length > 200) eventsEl.removeChild(eventsEl.lastChild);
  }

  function ensureNodeForEntity(entity){
    if (!entity || !entity.entityId) return null;
    if (entityToNode.has(entity.entityId)) return entityToNode.get(entity.entityId);
    const nodeId = entity.entityId;
    nodes.add({ id: nodeId, label: `${entity.kind}\n${entity.entityId}` });
    entityToNode.set(entity.entityId, nodeId);
    return nodeId;
  }

  function handleEvent(evt){
    recent.push(evt);
    if (recent.length > 1000) recent.shift();
    renderEventLine(evt);

    const nodeId = ensureNodeForEntity(evt.entity) || evt.id;
    // create node if missing (fallback)
    if (nodeId && !nodes.get(nodeId)) {
      nodes.add({ id: nodeId, label: evt.type });
    }

    // connect to parents if provided
    if (Array.isArray(evt.parentIds)) {
      evt.parentIds.forEach(pid => {
        const from = pid;
        const to = evt.entity && evt.entity.entityId ? evt.entity.entityId : evt.id;
        // ensure parent node exists
        if (!nodes.get(from)) nodes.add({ id: from, label: from });
        if (!nodes.get(to)) nodes.add({ id: to, label: to });
        edges.add({ id: `${from}->${to}:${Math.random().toString(36).slice(2,6)}`, from, to });
      });
    } else {
      // connect event-type based edges for visual grouping
      if (evt.type && evt.entity && evt.entity.entityId) {
        // small heuristic: make edges between types (fetch:start -> fetch:end)
        if (evt.type.endsWith(':end') || evt.type.endsWith(':error') || evt.type.endsWith(':fire') || evt.type === 'then:call' || evt.type === 'catch:call') {
          // find previous node with same entity (if any) and connect
          // not rigorous but creates visible chains
          // we just add a short-lived edge from a synthetic 'start' node to this node
        }
      }
    }
  }

  // WebSocket
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => console.log('Connected to collector ws', wsUrl);
  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.type === 'bootstrap' && Array.isArray(data.events)) {
        data.events.forEach(e => handleEvent(e));
      } else if (data.type === 'event' && data.event) {
        handleEvent(data.event);
      }
    } catch (e) {
      console.warn('bad ws message', e);
    }
  };
  ws.onclose = () => console.log('ws closed');
}
