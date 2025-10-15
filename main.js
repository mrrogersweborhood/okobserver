// main.js — OkObserver app entry
// v2.5.4 (patched to use core-fixed.js safely)

import { start } from './core-fixed.js';  // ✅ patched: use core-fixed router

// -------- Version banner --------
const VERSION = 'v2.5.4';
console.log('[OkObserver] Entry loaded:', VERSION);

// -------- API base locking --------
// On GitHub Pages, we must use the Cloudflare Worker proxy (CORS-safe).
// Elsewhere (e.g., local dev), you may point at a relative /api/ path or the same proxy.
(function configureApiBase() {
  const isGitHubPages = location.hostname.endsWith('github.io');
  const workerBase = 'https://okobserver-proxy.bob-b5c.workers.dev/wp/v2';
  const relativeBase = `${location.origin}/api/wp/v2`;

  // Prefer Worker on GH Pages, otherwise allow relative (or override via hash flag).
  let base = isGitHubPages ? workerBase : relativeBase;

  // Optional override for debugging: add #useWorker or #useRelative to the URL.
  const hash = location.hash || '';
  if (hash.includes('useWorker')) base = workerBase;
  if (hash.includes('useRelative')) base = relativeBase;

  // Freeze a global that other modules can read
  Object.defineProperty(window, 'OKO_API_BASE', {
    value: base,
    writable: false,
    configurable: false,
    enumerable: true
  });

  console.log('[OkObserver] API base (locked):', window.OKO_API_BASE);
})();

// -------- One-shot bootstrap --------
(async function boot() {
  if (window.__okBooted) return;
  window.__okBooted = true;

  try {
    // Ensure DOM is ready before we try to render into #app
    if (document.readyState === 'loading') {
      await new Promise((resolve) =>
        document.addEventListener('DOMContentLoaded', resolve, { once: true })
      );
    }
    await start(); // ✅ exported from core-fixed.js
  } catch (err) {
    console.error('OkObserver failed to start', err);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div style="padding:1rem;color:#b00020">
          <strong>App script did not execute.</strong>
          Check Network → main.js (200), then hard-reload.<br/>
          <small>${String(err)}</small>
        </div>
      `;
    }
  }
})();
