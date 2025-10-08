// core.js — app shell + router + scroll restore
// v2.4.4

import { renderHome }  from './home.js';
import { renderPost }  from './detail.js';
import { renderAbout } from './about.js';

const SCROLL_KEY = '__oko_scroll__';
let lastRoute = null;

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
  // Fallback: go to top
  requestAnimationFrame(() => window.scrollTo({ top: 0 }));
}

/* ---------------- Route helpers ---------------- */
function currentRoute() {
  const h = location.hash || '#/';
  return h.startsWith('#/') ? h : '#/';
}

/* ---------------- Router ---------------- */
export async function router(force = true) {
  const route = currentRoute();

  // Avoid redundant renders except for Home where we force a repaint
  if (!force && route === lastRoute) return;

  // Route: /post/:id
  const m = route.match(/^#\/post\/(\d+)(?:[/?].*)?$/);
  if (m) {
    lastRoute = route;
    await renderPost(m[1]);
    return;
  }

  // Route: /about
  if (route.startsWith('#/about')) {
    lastRoute = route;
    await renderAbout();
    return;
  }

  // Route: Home (default). Always force fresh grid so “Back to posts” never blanks.
  lastRoute = route;
  await renderHome();
  restoreHomeScroll();
}

/* ---------------- App start ---------------- */
export function start() {
  // Initial render (force)
  router(true);

  // Hash-based navigation — always force repaint so Back works 100%
  window.addEventListener('hashchange', () => router(true), { passive: true });

  // When coming back from bfcache/tab history, repaint
  window.addEventListener('pageshow', (e) => { if (e.persisted) router(true); });

  // Safety: if a hard reload happens, we’ll keep whatever scroll was last saved by Home
  window.addEventListener('beforeunload', () => {
    // (Home saves scroll on click; this is just a fallback)
    try {
      if ((location.hash || '#/') === '#/') {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0));
      }
    } catch {}
  });
}
