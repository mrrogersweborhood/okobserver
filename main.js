// main.js — OkObserver entry (v2.7.8)
// Bootstraps routing, locks API base, and starts the app.

import { start } from './core.js';

// ---- Lock API base to your Cloudflare Worker proxy ----
(function lockApiBase(){
  // If already locked elsewhere, don’t overwrite.
  if (!window.OKO_API_BASE_LOCKED) {
    // Set this to your Worker’s /wp/v2 root (no trailing slash)
    window.OKO_API_BASE_LOCKED = 'https://okobserver-proxy.bob-b5c.workers.dev/wp/v2';
  }
  console.log('[OkObserver] API base (locked):', window.OKO_API_BASE_LOCKED);
})();

// ---- Hard-reload detection: clear per-route scroll cache on true reload ----
(function hardReloadPurge(){
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    const isReload = nav && (nav.type === 'reload');
    if (isReload) {
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith('__scroll_')) sessionStorage.removeItem(k);
      });
    }
  } catch {}
})();

// ---- Global click handler for simple in-page nav fallbacks (defensive) ----
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (!a) return;
  // allow default hash navigation; router listens to hashchange
}, { passive: true });

// ---- Start the app ----
try {
  console.log('[OkObserver] Entry loaded: v2.7.8');
  start();
} catch (err) {
  console.error('OkObserver failed to start', err);
  const app = document.getElementById('app');
  if (app) app.innerHTML = `
    <div style="max-width:720px;margin:2rem auto;padding:1rem;border:1px solid #f3caca;background:#fff5f5;color:#8a1f1f;border-radius:8px;">
      <strong>App script did not execute.</strong><br/>
      Check Network → <code>main.js</code> (200), hard-reload, and confirm modules are loading.
    </div>
  `;
}
