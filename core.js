// core.js — app shell + router + scroll restore
// v2.4.6

import { renderHome }  from './home.js';
import { renderPost }  from './detail.js';
import { renderAbout } from './about.js';

const SCROLL_KEY = '__oko_scroll__';
let lastRoute = null;

/* ---------------- DOM readiness ---------------- */
function domReady() {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    return Promise.resolve();
  }
  return new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
}

/* Ensure an #app mount exists */
function ensureAppMount() {
  let el = document.getElementById('app');
  if (!el) {
    el = document.createElement('main');
    el.id = 'app';
    // insert before footer if present, else at end of body
    const footer = document.querySelector('footer');
    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(el, footer);
    } else {
      document.body.appendChild(el);
    }
  }
  return el;
}

/* ---------------- Scroll restore (Home) ---------------- */
function restoreHomeScroll() {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (raw != null) {
      const y = parseInt(raw, 10);
      sessionStorage.removeItem(SCROLL_KEY);
      if (!Number.isNaN(y)) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, behavior: ('instant' in window) ? 'instant' : 'auto' });
        });
        return;
      }
    }
  } catch {}
  requestAnimationFrame(() => window.scrollTo({ top: 0 }));
}

/* ---------------- Route helpers ---------------- */
function currentRoute() {
  const h = location.hash || '#/';
  return h.startsWith('#/') ? h : '#/';
}

/* ---------------- Router ---------------- */
export async function router(force = true) {
  ensureAppMount(); // make sure #app exists before any render
  const route = currentRoute();

  if (!force && route === lastRoute) return;

  const m = route.match(/^#\/post\/(\d+)(?:[/?].*)?$/);
  if (m) {
    lastRoute = route;
    await renderPost(m[1]);
    return;
  }

  if (route.startsWith('#/about')) {
    lastRoute = route;
    await renderAbout();
    return;
  }

  // Home (default) — always render fresh so Back-to-posts never blanks
  lastRoute = route;
  await renderHome();
  restoreHomeScroll();
}

/* ---------------- App start ---------------- */
export async function start() {
  await domReady();
  ensureAppMount();

  // Initial render
  await router(true);

  // Hash-based navigation — force repaint so Back works 100%
  window.addEventListener('hashchange', () => router(true), { passive: true });

  // When returning from bfcache, repaint
  window.addEventListener('pageshow', (e) => { if (e.persisted) router(true); });

  // Fallback scroll save on unload (Home already saves on click)
  window.addEventListener('beforeunload', () => {
    try {
      if ((location.hash || '#/') === '#/') {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0));
      }
    } catch {}
  });
}
