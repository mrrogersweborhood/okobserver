/* ---------------------------------------------------
   main.js — OkObserver App Main Entry (Optimized)
   ---------------------------------------------------
   This file contains your router, app boot logic,
   and safe performance improvements such as idle
   prefetching. All console logs remain intact.
--------------------------------------------------- */

// ------------------------
// Global Config
// ------------------------
const OKO_API_BASE = window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
console.log('[OkObserver] main.js loaded, API base:', OKO_API_BASE);

// ------------------------
// Router
// ------------------------
async function router() {
  const hash = window.location.hash || '#/';
  const app = document.getElementById('app');
  if (!app) return console.error('[Router] #app not found');

  if (hash === '#/' || hash.startsWith('#/page')) {
    console.log('[Router] → Home');
    const mod = await import('./home.v263.js?v=2025-10-15a');
    await mod.default(app);
  } else if (hash.startsWith('#/post/')) {
    const id = hash.split('/')[2];
    console.log('[Router] → Detail', id);
    const mod = await import('./detail.v263.js?v=2025-10-15a');
    await mod.default(app, id);
  } else if (hash.startsWith('#/about')) {
    console.log('[Router] → About');
    const mod = await import('./about.v263.js?v=2025-10-15a');
    await mod.default(app);
  } else {
    console.log('[Router] → 404');
    app.innerHTML = `<section class="page-error"><p>Page not found.</p></section>`;
  }
}

// ------------------------
// Event Listeners
// ------------------------
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);

// ------------------------
// Idle Warm-Up Prefetch
// ------------------------
(function(){
  const base = (window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2').replace(/\/+$/,'');
  const warm = async () => {
    try {
      const url = `${base}/posts?status=publish&_embed=1&per_page=18&page=2`;
      if (window.cachedJSON) {
        console.log('[Warm-up] Prefetching page 2...');
        await window.cachedJSON(url, {headers:{accept:'application/json'}});
        console.log('[Warm-up] Page 2 cached.');
      }
    } catch (err) {
      console.warn('[Warm-up] Failed:', err);
    }
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(warm, {timeout: 2000});
  } else {
    setTimeout(warm, 2000);
  }
})();

// ------------------------
// Register Service Worker
// ------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=2025-10-15a')
      .then(reg => console.log('[OkObserver] SW registered', reg.scope))
      .catch(err => console.warn('[OkObserver] SW registration failed', err));
  });
}

// ------------------------
// Global Ready Notification
// ------------------------
console.log('[OkObserver] main.js initialization complete.');
