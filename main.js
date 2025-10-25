// main.js — v2025-10-24f
// Notes:
// - PostDetail bumped to ?v=2025-10-24f to force fresh load of the new hero-video logic.
// - Other modules remain on 2025-10-24e.
// After replacing, Unregister the SW and hard refresh.

const VER = '2025-10-24f';

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js?v=' + '2025-10-24e');
      console.log('[OkObserver] SW registered', reg);
    } catch (e) {
      console.warn('[OkObserver] SW registration failed', e);
    }
  });
}

import { renderHome }     from './Home.js?v=2025-10-24e';
import { renderAbout }    from './About.js?v=2025-10-24e';
import { renderSettings } from './Settings.js?v=2025-10-24e';
// IMPORTANT: bump PostDetail to the new version so the browser/SW fetches fresh code
import { renderPost }     from './PostDetail.js?v=2025-10-24g';

const app = document.getElementById('app');

function parseHash() {
  const h = location.hash || '#/';
  const [, route, id] = h.match(/^#\/?([^\/]+)?\/?([^\/]+)?/) || [];
  return { route: route || '', id };
}

async function router() {
  const { route, id } = parseHash();
  if (!app) return;

  app.innerHTML = `<div class="loading">Loading…</div>`;

  try {
    if (!route || route === '') {
      await renderHome(app);
    } else if (route === 'post' && id) {
      await renderPost(app, id);
    } else if (route === 'about') {
      await renderAbout(app);
    } else if (route === 'settings') {
      await renderSettings(app);
    } else {
      app.innerHTML = `<div class="container"><h2>Not found</h2></div>`;
    }
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="container error">
      <h2>Something went wrong</h2>
      <pre>${(e && e.message) || e}</pre>
    </div>`;
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);
