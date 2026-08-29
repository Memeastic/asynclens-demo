// Minimal collector + static file server
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Serve public frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory recent events buffer (optional)
const recentEvents = [];

// WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Dashboard connected via WebSocket');
  // send recent events to new client for quick warm-up
  ws.send(JSON.stringify({ type: 'bootstrap', events: recentEvents }));
  ws.on('close', () => {
    console.log('Dashboard disconnected');
  });
});

// HTTP endpoint for agents to POST events
app.post('/asynclens/events', (req, res) => {
  const event = req.body;
  if (!event || !event.id) {
    // Very small validation
    return res.status(400).json({ error: 'invalid event' });
  }

  // store last 1000
  recentEvents.push(event);
  if (recentEvents.length > 1000) recentEvents.shift();

  const payload = JSON.stringify({ type: 'event', event });
  // broadcast to all ws clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });

  // reply quickly
  res.status(204).end();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Collector + static server listening on http://localhost:${PORT}`);
});
