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

Security & privacy

- The instrumentation has a redaction config at `window.AsyncLens.config.redactKeys` which defaults to `['authorization','cookie','set-cookie','password']`.
- You can customize this before the instrumentation script loads in your app:

```html
<script>
  window.AsyncLens = window.AsyncLens || {};
  window.AsyncLens.config = { redactKeys: ['authorization','cookie','password','token'] };
</script>
<script src="/instrumentation.js"></script>
```

Replay & snapshots

- The dashboard includes Play / Pause / Step controls to replay events as they arrived.
- Use Save to persist a snapshot to `snapshots/` on the server and Load to pull recent events back into the UI.

Next steps planned

- Improve automatic promise chain linking and resolution timing.
- Add richer request/response inspector with headers and sizes.
- Add clustering/virtualization for very large graphs.
- Add browser extension / devtools integration.

