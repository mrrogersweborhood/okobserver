// main.js — OkObserver entry (v2.6.x)
// Sets the API base, wires a tiny router, and lazy-loads route modules.

(() => {
  // ---------- 1) API base (Cloudflare Worker) ----------
  // CHANGE THIS ONLY if your Worker URL is different.
  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev';

  // Expose for all route modules
  window.OKO_API_BASE = API_BASE;

  // ---------- 2) Simple logger ----------
  const log = (...a) => console.log('[OkObserver]', ...a);
  const errorLog = (...a) => console.error('[OkObserver]', ...a);

  // ---------- 3) App root ----------
  const app = document.getElementById('app');
  if (!app) {
    document.body.innerHTML = '<main id="app"></main>';
  }

  // ---------- 4) Router ----------
  const routes = {
    '': () => import(`./home.v263.js?v=265`).then(m => m.default),
    'posts': () => import(`./home.v263.js?v=265`).then(m => m.default),
    'about': () => import(`./about.v263.js?v=265`).then(m => m.default),
    'post': () => import(`./detail.v263.js?v=265`).then(m => m.default),
  };

  function parseHash() {
    // #/post/123   => ["post","123"]
    // #/about      => ["about"]
    // "" or "#/"   => [""]
    const h = (location.hash || '').replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean);
    return parts;
  }

  async function render() {
    try {
      const parts = parseHash();
      const key = (parts[0] || '').toLowerCase();

      // pick route
      let load;
      if (!key || key === 'posts') load = routes[''];
      else if (routes[key]) load = routes[key];
      else load = routes['']; // fallback to home

      const mod = await load();
      // route handlers are default exported functions
      // home: fn(app)
      // about: fn(app)
      // detail: fn(app, id)
      if (key === 'post') {
        const id = parts[1];
        await mod(document.getElementById('app'), id);
      } else {
        await mod(document.getElementById('app'));
      }
    } catch (e) {
      errorLog('router error:', e);
      const el = document.getElementById('app');
      if (el) {
        el.innerHTML = `
          <section class="page-error">
            <p>Page error: ${e?.message || e}</p>
          </section>
        `;
      }
    }
  }

  // ---------- 5) Start ----------
  log('main.js v2.6.x booting');
  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', render);
})();
