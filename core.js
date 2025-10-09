// core.js — OkObserver router + lifecycle (v2.7.8)
import { renderHome, destroyHome } from './home.js';
import { renderPostDetail } from './detail.js';
import { renderAbout } from './about.js';

let currentRoute = '';

export async function router() {
  const hash = window.location.hash || '#/';
  const main = document.getElementById('app');
  if (!main) return;

  if (hash === currentRoute) return;
  currentRoute = hash;

  destroyHome(); // clean up scroll listeners if switching from home

  if (hash === '#/' || hash.startsWith('#/page/')) {
    await renderHome();
  } else if (hash.startsWith('#/post/')) {
    const id = hash.split('/post/')[1];
    if (id) await renderPostDetail(id);
  } else if (hash.startsWith('#/about')) {
    await renderAbout();
  } else {
    main.innerHTML = `<p style="text-align:center;margin:2rem;">Page not found.</p>`;
  }
}

export function start() {
  window.addEventListener('hashchange', router);
  router();
}
