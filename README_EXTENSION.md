# AsyncLens Extension — Install & Use

This extension injects the AsyncLens instrumentation into pages so your web app automatically reports async events to the AsyncLens collector (default: http://localhost:3000/asynclens/events).

Files in the repo:
- extension/manifest.json — extension manifest (Manifest V3)
- extension/content-injector.js — content script that injects the instrumentation into each page
- extension/options.html, options.js — configure collector URL & instrumentation script URL

How it works
- The extension injects an inline script into every page which sets window.__ASYNCLENS_COLLECTOR__ to the configured collector URL, then appends a script tag that loads the instrumentation script (default: http://localhost:3000/instrumentation.js).
- Because the instrumentation runs in the page context, it can observe window.fetch, setTimeout, Promise chains, WebSocket, etc., and sends events to the collector.

Install as an unpacked extension (Chrome / Edge)
1. Build and run the local server (in your project root):
   npm install
   npm start
   (Server listens by default on http://localhost:3000)
2. Open Chrome and go to chrome://extensions
3. Enable Developer mode (top right)
4. Click "Load unpacked" and select the `extension/` directory in the repository
5. The extension should appear. Click "Details" → "Options" to open the options page and verify the collector URL

Install in Firefox (temporary)
1. Open about:debugging#/runtime/this-firefox
2. Click "Load Temporary Add-on" and pick the extension/manifest.json file
3. Open Options by visiting about:addons → (find the extension) → Preferences (if available), or open extension/options.html via the extension page

Using it
- Open the AsyncLens dashboard first: http://localhost:3000/dashboard.html
- Open any web page (or your demo page) in the browser that has the extension loaded. The content script will automatically inject the instrumentation.
- Generate activity on the page (requests, promises, timers). Events will be POSTed to the collector and appear in the dashboard.

Notes & Privacy
- The extension injects a script into all pages by default. For privacy, you can edit the manifest to restrict matches to specific sites (replace "<all_urls>" with a more specific pattern).
- The instrumentation has redaction support (window.AsyncLens.config.redactKeys). Use the options page to ensure sensitive headers/fields are not sent.

Packaging for distribution
- For Chrome Web Store you must follow Chrome’s packaging and publishing flow, including signing and submitting the extension.
- For Firefox, create a web-extension package (.xpi) following Mozilla’s docs.

If you want, I can:
- Add an extension-hosted copy of instrumentation.js so the extension works offline (currently it loads instrumentation from your local server by default)
- Restrict injection to a configurable domain list in options
- Prepare instructions and a one-click build script to package a distributable extension (.zip / .xpi)

Tell me which of those you want next and I’ll push the changes.  
