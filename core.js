// core.js — OkObserver client router
// v2.5.4

import { renderHome } from './home.js';
import { renderPost } from './detail.js';
import { renderAbout } from './about.js';

// Router state for scroll persistence
const scrollMemory = new Map();
let currentRoute = '';

export async function start() {
  console.log('[OkObserver] Router initializing…');
  window.addEventListener('hashchange', router);
  await router();
}

// Save scroll position per route
function saveScrollForRoute(route) {
  scrollMemory.set(route, window.scrollY || 0);
}

// Restore scroll position when navigating back
function restoreScrollForRoute(route) {
  const y = scrollMemory.get(route);
  if (typeof y === 'number') {
    setTimeout(() => window.scrollTo(0, y), 40);
  } else {
    window.scrollTo(0, 0);
  }
}

// Core router
export async function router() {
  const hash = location.hash || '#/';
  const path = hash.replace(/^#/, '');
  const app = document.getElementById('app');
  if (!app) return console.error('[OkObserver] app container not found');

  // Save old route scroll before navigation
  if (currentRoute) saveScrollForRoute(currentRoute);

  // Routing logic
  if (path === '/' || path.startsWith('/?')) {
    currentRoute = '/';
    await renderHome();
    restoreScrollForRoute('/');
  } else if (path.startsWith('/post/')) {
    currentRoute = path;
    const id = path.split('/post/')[1];
    if (!id) return (app.innerHTML = '<p>Invalid post ID.</p>');
    await renderPost(id);
  } else if (path.startsWith('/about')) {
    currentRoute = '/about';
    await renderAbout();
  } else {
    currentRoute = path;
    app.innerHTML = `<p style="padding:2rem">Page not found.</p>`;
  }
}
