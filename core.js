// core.js – main router and app bootstrap

import { renderHome } from './home.js';
import { ordinalDate } from './shared.js'; // if needed elsewhere

async function router() {
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);

  if (m && m[1]) {
    const { renderPost } = await import('./detail.js');
    renderPost(m[1]);
  } else if (hash.startsWith('#/about')) {           // ← NEW: explicit About route
    const { renderAbout } = await import('./about.js');
    renderAbout();
  } else {
    renderHome();
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);
