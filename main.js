/* OkObserver · main.js · v2.7.1 (dynamic imports + cache bust) */
console.log('[OkObserver] main.js v2.7.1 booting');

// API base (Cloudflare Worker)
window.OKO_API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

// bump this to refresh module fetches
const V = 'v=271';

// Dynamic import helpers (so we can append ?v=…)
const loadHome   = () => import(`./home.v263.js?${V}`);
const loadAbout  = () => import(`./about.v263.js?${V}`);
const loadDetail = () => import(`./detail.v263.js?${V}`);

async function router() {
  const hash = location.hash || '#/';
  const app = document.getElementById('app');
  if (!app) return;

  try {
    if (hash === '#/' || hash === '' || hash.startsWith('#/page/')) {
      const mod = await loadHome();
      await mod.default(app);
    } else if (hash.startsWith('#/post/')) {
      const id = hash.split('/')[2];
      const mod = await loadDetail();
      await mod.default(app, id);
    } else if (hash.startsWith('#/about')) {
      const mod = await loadAbout();
      await mod.default(app);
    } else {
      app.innerHTML = `<p>Page not found.</p>`;
    }
  } catch (err) {
    console.error('[OkObserver] router error:', err);
    app.innerHTML = `<p style="color:#b00">Page error: failed to load module.</p>`;
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);

// keep SW registration (safe to fail silently)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
