// main.js — v2025-10-24h
// Notes:
// - SW and PostDetail bumped to ?v=2025-10-24h so the new code is guaranteed to load.
// - Home/About/Settings remain on 2025-10-24e (no change needed).

const VER = '2025-10-24h';

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js?v=' + VER);
      console.log('[OkObserver] SW registered', reg);
    } catch (e) {
      console.warn('[OkObserver] SW registration failed', e);
    }
  });
}

import { renderHome }     from './Home.js?v=2025-10-24e';
import { renderAbout }    from './About.js?v=2025-10-24e';
import { renderSettings } from './Settings.js?v=2025-10-24e';
// IMPORTANT: keep PostDetail on the latest token to force-refresh the file in browsers/SW
import { renderPost }     from './PostDetail.js?v=2025-10-24h';

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
