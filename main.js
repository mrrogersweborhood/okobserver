// main.js — v2025-10-27d
// Updates:
// - Adds hamburger menu injection + toggle (no index.html edits needed)
// - Keeps SW token at 2025-10-27c; PostDetail import bumped to 2025-10-27e

const VER = '2025-10-27e';

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

import { renderHome }     from './Home.js?v=2025-10-27d';
import { renderAbout }    from './About.js?v=2025-10-27a';
import { renderSettings } from './Settings.js?v=2025-10-27a';
// IMPORTANT: keep PostDetail on latest token to force-refresh
import { renderPost }     from './PostDetail.js?v=2025-10-27f';

const app = document.getElementById('app');

function parseHash() {
  const h = location.hash || '#/';
  const [, route, id] = h.match(/^#\/?([^\/]+)?\/?([^\/]+)?/) || [];
  return { route: route || '', id };
}

/* =========================
   Hamburger menu (no HTML changes)
   ========================= */
function setupHamburger() {
  const brand = document.querySelector('.brand');
  const nav   = document.querySelector('.main-nav');
  if (!brand || !nav) return;

  // Avoid duplicate button if hot-reloading
  if (document.getElementById('nav-toggle')) return;

  const btn = document.createElement('button');
  btn.id = 'nav-toggle';
  btn.className = 'nav-toggle';
  btn.setAttribute('aria-label', 'Menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `
    <span class="nav-toggle-bar"></span>
    <span class="nav-toggle-bar"></span>
    <span class="nav-toggle-bar"></span>
  `;
  // insert at start of .brand so logo stays left, button near it on small screens
  brand.insertBefore(btn, brand.firstChild);

  btn.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', String(open));
  });

  // Close menu when a nav link is clicked (small screens)
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      document.body.classList.remove('nav-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  // On resize to desktop, ensure menu state is reset
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      document.body.classList.remove('nav-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
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
window.addEventListener('load', () => {
  setupHamburger();
  router();
});
