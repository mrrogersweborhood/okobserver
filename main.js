// main.js  — OkObserver v2.6.5 stable bootstrap
console.log('[OkObserver] main.js v2.6.x booting');

const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev';
window.OKO_API_BASE = API_BASE;

const app = document.getElementById('app');
if (!app) {
  console.error('[OkObserver] App container missing.');
}

// Simple module cache
const cache = {};

async function loadModule(path) {
  if (cache[path]) return cache[path];
  const mod = await import(path);
  cache[path] = mod.default || mod;
  return cache[path];
}

async function router() {
  const hash = location.hash || '#/';
  const [route, id] = hash.replace(/^#\//, '').split('/');
  try {
    if (!route || route === '') {
      const renderHome = await loadModule('./home.v263.js?v=265');
      await renderHome(app);
    } else if (route === 'post' && id) {
      const renderDetail = await loadModule('./detail.v263.js?v=265');
      await renderDetail(app, id);
    } else if (route === 'about') {
      const renderAbout = await loadModule('./about.v263.js?v=265');
      await renderAbout(app);
    } else {
      app.innerHTML = `<section class="page-error"><p>Page not found.</p></section>`;
    }
  } catch (err) {
    console.error('[OkObserver router error]', err);
    app.innerHTML = `<section class="page-error"><p>Router error: ${err.message}</p></section>`;
  }
}

// Listen for navigation
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
