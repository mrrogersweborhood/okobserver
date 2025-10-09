// core.js — simple hash router with scroll restoration
// v2.5.4

import { renderHome } from './home.js';
import { renderPost } from './detail.js';
import { renderAbout } from './about.js';

let lastScrollPositions = {};
let currentRoute = '/';

/** Save current scroll position for the given route */
export function saveScrollForRoute(route) {
  lastScrollPositions[route] = window.scrollY;
}

/** Restore scroll position for the given route, if available */
export function restoreScrollForRoute(route) {
  const y = lastScrollPositions[route] ?? 0;
  requestAnimationFrame(() => window.scrollTo(0, y));
}

/** Basic router */
export async function router() {
  const hash = location.hash || '#/';
  const route = hash.replace(/^#/, '') || '/';
  const main = document.getElementById('app');

  // Before navigating, remember current route’s scroll position
  if (currentRoute) saveScrollForRoute(currentRoute);
  currentRoute = route;

  if (!main) return;

  if (route === '/' || route.startsWith('/page')) {
    await renderHome();
    restoreScrollForRoute(route);
  } else if (route.startsWith('/post/')) {
    const id = route.split('/post/')[1];
    if (id) await renderPost(id);
    window.scrollTo(0, 0); // always start at top for post
  } else if (route.startsWith('/about')) {
    await renderAbout();
    window.scrollTo(0, 0);
  } else {
    main.innerHTML = `<p>Page not found.</p>`;
  }
}

/** Start router and listen for hash changes */
export function start() {
  window.addEventListener('hashchange', router);
  router();
}
