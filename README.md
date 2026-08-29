# AsyncLens

AsyncLens is a lightweight developer tool for visualizing JavaScript asynchronous flows (fetch, promises, timers, websockets) in real time.

This repository contains:

- public/instrumentation.js — the client-side instrumentation library (inject into pages)
- public/demo.html — example demo page (existing)
- public/dashboard.html — visualization UI (2D + 3D)
- server.js — collector + static server + WebSocket

Quick start

1. Install dependencies (if any) and start server:

   npm install
   npm start

2. Open the dashboard and demo:

   http://localhost:3000/dashboard.html  (open first)
   http://localhost:3000/demo.html

Notes

- The instrumentation attempts to avoid sending very large payloads and trims values.
- Use AsyncLens.wrapAsync(fn) to explicitly mark async functions if you want clearer await points.
- Snapshots: use the "Save" button in the dashboard to store a JSON snapshot in snapshots/. Use "Load" to fetch recent events.

Next steps planned

- Improve automatic promise chain linking and resolution timing.
- Add richer request/response inspector with headers and sizes.
- Add clustering/virtualization for very large graphs.
- Add browser extension / devtools integration.

