// core-fixed.js — OkObserver Router (cache-busted dynamic imports)

/**
 *  SPA Router + Core Entry
 *  Handles #/ routes for home, post detail, and about views.
 *  Uses ?v= token for cache-busting so browsers always fetch new versions.
 */

console.log('[OkObserver] core-fixed.js loaded');

const VERSION = '2025-10-15a'; // bump this when you redeploy

// Dynamic view imports with cache-busting
const loadHome   = () => import(`./home.v263.js?v=${VERSION}`);
const loadDetail = () => import(`./detail.v263.js?v=${VERSION}`);
const loadAbout  = () => import(`./about.v263.js?v=${VERSION}`);

// Simple router
export async function start() {
  const app = document.getElementById('app');
  if (!app) {
    console.warn('[OkObserver] #app not found');
    return;
  }

  const hash = window.location.hash || '#/';
  console.log('[OkObserver] Route:', hash);

  try {
    if (hash.startsWith('#/about')) {
      const mod = await loadAbout();
      mod.renderAbout?.();
    } else if (hash.startsWith('#/post/')) {
      const id = hash.split('/')[2];
      const mod = await loadDetail();
      mod.renderDetail?.(id);
    } else {
      const mod = await loadHome();
      mod.renderHome?.();
    }
  } catch (err) {
    console.error('[OkObserver] Router error:', err);
    app.innerHTML = `
      <div style="padding:1rem;color:#b00020;">
        <strong>Failed to load view.</strong><br/>
        ${String(err)}
      </div>`;
  }
}

// Reload view when hash changes
window.addEventListener('hashchange', start);
