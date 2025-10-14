<script type="module">
// OkObserver main bootstrap v2.6.x (stable)

(function(){
  // ---- CONFIG --------------------------------------------------------------
  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2'; // Cloudflare Worker
  const SITE_TITLE = 'The Oklahoma Observer';

  // Place config where all modules can read it
  window.OKO = Object.assign(window.OKO || {}, {
    VERSION: '2.6.x',
    API_BASE,           // <— detail/home/about read this
    SITE_TITLE
  });

  console.log('[OkObserver] main.js v2.6.x booting');

  // ---- DOM ----------------------------------------------------------------
  const app = document.getElementById('app');
  if (!app) {
    document.body.innerHTML = '<div id="app"></div>';
  }

  // ---- SIMPLE ROUTER ------------------------------------------------------
  async function loadModule(path) {
    const mod = await import(path);
    if (typeof mod.default !== 'function') {
      throw new TypeError('mod.default is not a function');
    }
    return mod.default;
  }

  async function render(route, id) {
    try {
      let renderFn;

      if (!route || route === '') {
        renderFn = await loadModule('./home.v263.js?v=265');
      } else if (route === 'about') {
        renderFn = await loadModule('./about.v263.js?v=265');
      } else if (route === 'post') {
        renderFn = await loadModule('./detail.v263.js?v=265');
      } else {
        renderFn = await loadModule('./home.v263.js?v=265');
      }

      await renderFn(document.getElementById('app'), id || null);
    } catch (err) {
      console.error('[Router error]', err);
      const el = document.getElementById('app');
      if (el) {
        el.innerHTML = `<p style="color:#c00">Page error: ${String(err.message || err)}</p>`;
      }
    }
  }

  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const parts = raw.split('/');
    return { route: parts[0] || '', id: parts[1] || '' };
  }

  async function start() {
    const { route, id } = parseHash();
    await render(route, id);
  }

  window.addEventListener('hashchange', start, { passive: true });
  start();
})();
</script>
