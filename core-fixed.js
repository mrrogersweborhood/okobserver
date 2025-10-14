// core-fixed.js v2.65 — minimal router with resilient page loading

const app = document.getElementById('app');

function parseHash() {
  // #/post/123 → ["post","123"]
  const raw = (location.hash || '#/').replace(/^#\/?/, '');
  return raw ? raw.split('/') : [];
}

async function loadModule(path) {
  // All your pages are ES modules we import dynamically
  const mod = await import(path);
  // Try common export patterns
  const render =
    (typeof mod.default === 'function' && mod.default) ||
    (typeof mod.render === 'function' && mod.render) ||
    (typeof mod.home === 'function' && mod.home) ||
    (typeof mod.main === 'function' && mod.main) ||
    null;

  if (!render) {
    throw new TypeError('mod.default is not a function');
  }
  return render;
}

export async function start() {
  await router();
  window.addEventListener('hashchange', router, { passive: true });
}

export async function router() {
  if (!app) return;
  const [route, arg] = parseHash();
  try {
    let render;
    if (!route || route === '') {
      render = await loadModule('./home.js?v=265');
      await render(app);
      return;
    }
    if (route === 'about') {
      render = await loadModule('./about.js?v=265');
      await render(app);
      return;
    }
    if (route === 'post' && arg) {
      render = await loadModule('./detail.v263.js?v=265');
      await render(app, arg);
      return;
    }

    // Fallback → home
    render = await loadModule('./home.js?v=265');
    await render(app);
  } catch (err) {
    console.error('[Router error]', err);
    app.innerHTML = `
      <section class="container" style="max-width:960px;margin:2rem auto;">
        <p class="page-error">Page error: ${String(err && err.message || err)}</p>
      </section>`;
  }
}

// Auto-start if this module is included straight in <script type="module">
start();
