// server.js
// Collector + static file server with WebSocket broadcast and snapshot endpoints

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();

// Accept raw text bodies as well as JSON (helps when clients use sendBeacon)
app.use(express.text({ type: '*/*' }));
app.use(express.json({ limit: '5mb' }));

// Serve public frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory recent events buffer
const recentEvents = [];
const MAX_EVENTS = 5000;

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  console.log('Dashboard connected via WebSocket');
  // send recent events to new client for quick warm-up
  try {
    ws.send(JSON.stringify({ type: 'bootstrap', events: recentEvents }));
  } catch (e) {}
  ws.on('close', () => {
    console.log('Dashboard disconnected');
  });
});

// Helper: broadcast to all connected clients
function broadcastEvent(event) {
  const payload = JSON.stringify({ type: 'event', event });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(payload); } catch (e) { /* ignore per-client errors */ }
    }
  });
}

// HTTP endpoint for agents to POST events
app.post('/asynclens/events', (req, res) => {
  let event = req.body;

  // If body is a string, try to parse JSON (this handles sendBeacon/text payloads)
  if (typeof event === 'string') {
    try {
      event = JSON.parse(event);
    } catch (e) {
      // parsing failed; respond 400
      return res.status(400).json({ error: 'invalid json body' });
    }
  }

  if (!event || !event.id) {
    return res.status(400).json({ error: 'invalid event' });
  }

  // store last MAX_EVENTS events
  recentEvents.push(event);
  if (recentEvents.length > MAX_EVENTS) recentEvents.shift();

  // broadcast to dashboards
  broadcastEvent(event);

  // respond quickly with 204 No Content
  res.status(204).end();
});

// GET recent events (simple API for snapshot/download)
app.get('/asynclens/events', (req, res) => {
  res.json({ events: recentEvents.slice(-1000) });
});

// POST snapshot to save to disk
app.post('/asynclens/snapshot', (req, res) => {
  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch(e){ payload = { events: [] }; }
  }
  const snapshotsDir = path.join(__dirname, 'snapshots');
  if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir);
  const name = `snapshot-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  const filePath = path.join(snapshotsDir, name);
  const data = JSON.stringify(payload, null, 2);
  fs.writeFile(filePath, data, (err) => {
    if (err) return res.status(500).json({ error: 'write_failed', detail: String(err) });
    res.json({ ok: true, name });
  });
});

// GET snapshot file
app.get('/asynclens/snapshot/:name', (req, res) => {
  const snapshotsDir = path.join(__dirname, 'snapshots');
  const filePath = path.join(snapshotsDir, req.params.name);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Collector + static server listening on http://localhost:${PORT}`);
});
