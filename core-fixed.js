// core-fixed.js v2.65
const app = document.getElementById('app');

function parseHash() {
  const raw = (location.hash || '#/').replace(/^#\/?/, '');
  return raw ? raw.split('/') : [];
}

async function loadModule(path) {
  const mod = await import(path);
  const render =
    (typeof mod.default === 'function' && mod.default) ||
    (typeof mod.render === 'function' && mod.render) ||
    (typeof mod.home === 'function' && mod.home) ||
    (typeof mod.main === 'function' && mod.main) ||
    null;
  if (!render) throw new TypeError('mod.default is not a function');
  return render;
}

export async function start() {
  await router();
  addEventListener('hashchange', router, { passive: true });
}

export async function router() {
  if (!app) return;
  const [route, id] = parseHash();
  try {
    if (!route) {
      const render = await loadModule('./home.js?v=265');
      return render(app);
    }
    if (route === 'about') {
      const render = await loadModule('./about.js?v=265');
      return render(app);
    }
    if (route === 'post' && id) {
      const render = await loadModule('./detail.v263.js?v=265');
      return render(app, id);
    }
    const render = await loadModule('./home.js?v=265');
    return render(app);
  } catch (err) {
    console.error('[Router error]', err);
    app.innerHTML = `
      <section class="container"><p class="page-error">
        Page error: ${String(err && err.message || err)}
      </p></section>`;
  }
}

start();
