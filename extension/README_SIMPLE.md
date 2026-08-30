# AsyncLens Simple extension

This is a self-contained Chrome extension that collects simple instrumentation events directly in the browser and stores them in extension storage. No external server is required.

How to load
1. Open Chrome and go to chrome://extensions
2. Enable Developer mode (top-right)
3. Click "Load unpacked" and select the `extension/` folder inside this repository
4. After loading, open the extension's Options page (click Details → Options) to view collected events

Notes
- The extension injects a small instrumentation script into pages and captures fetch/timer events.
- Use the 'Send Test' button on the Options page to trigger a test event on the active tab.
- Events are stored in chrome.storage.local. You can export them as JSON.
