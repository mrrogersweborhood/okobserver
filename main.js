/* =========================================================
   OkObserver — Main Application Entry (FINAL FIXED BUILD)
   =========================================================
   - Restores API_BASE + apiJSON (so "API not ready" disappears)
   - Keeps router and service worker logic stable
   - Works with new home.v263.js + detail.v263.js
   ========================================================= */

const OKO_API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
window.API_BASE = OKO_API_BASE;
console.log('[OkObserver] main.js loaded, API base:', OKO_API_BASE);

/* ---------------------------------
   UNIVERSAL FETCH WRAPPER
---------------------------------- */
window.apiJSON = async function apiJSON(endpoint, params = {}) {
  const url = new URL(
    endpoint.startsWith('http') ? endpoint : `${OKO_API_BASE}/${endpoint.replace(/^\/+/, '')}`
  );
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[apiJSON]', err);
    throw err;
  }
};

/* ---------------------------------
   SIMPLE ROUTER
---------------------------------- */
async function router() {
  const hash = window.location.hash || '#/';
  const app = document.getElementById('app');
  if (!app) return console.error('[Router] #app not found');

  if (hash === '#/' || hash.startsWith('#/page')) {
    console.log('[Router] → Home');
    const mod = await import('./home.v263.js?v=2025-10-18d');
    await mod.default(app);
  } else if (hash.startsWith('#/post/')) {
    const id = hash.split('/')[2];
    console.log('[Router] → Detail', id);
    const mod = await import('./detail.v263.js?v=2025-10-18d');
    await mod.default(app, id);
  } else if (hash.startsWith('#/about')) {
    console.log('[Router] → About');
    const mod = await import('./about.v263.js?v=2025-10-18d');
    await mod.default(app);
  } else {
    app.innerHTML = `<section class="page-error"><p>Page not found.</p></section>`;
  }
}

/* ---------------------------------
   ROUTE + EVENT HOOKS
---------------------------------- */
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);

/* ---------------------------------
   PREFETCH FOR PERFORMANCE
---------------------------------- */
(function warmCache() {
  const url = `${OKO_API_BASE}/posts?status=publish&_embed=1&per_page=18&page=2`;
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => fetch(url).catch(() => {}), { timeout: 2000 });
  } else {
    setTimeout(() => fetch(url).catch(() => {}), 2000);
  }
})();

/* ---------------------------------
   SERVICE WORKER
---------------------------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js?v=2025-10-18b')
      .then((reg) => console.log('[OkObserver] SW registered', reg.scope))
      .catch((err) => console.warn('[OkObserver] SW registration failed', err));
  });
}

/* ---------------------------------
   DONE
---------------------------------- */
console.log('[OkObserver] main.js initialization complete.');
