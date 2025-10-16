// core-fixed.js — robust router for GH Pages (subfolder-safe) with cache-busted imports
console.log('[OkObserver] core-fixed.js loaded');

const VERSION = '2025-10-15a';

// Build subfolder-safe URLs (works under /okobserver/)
function importWithVersion(relPath) {
  const u = new URL(relPath, import.meta.url);
  // ensure a version param for cache-busting without breaking the base path
  u.searchParams.set('v', VERSION);
  return import(u.href);
}

// Try a set of common export shapes
function callRender(mod, which, ...args) {
  const fns = [
    mod?.[which],
    mod?.default?.[which],
    which === 'renderHome'   ? mod?.startHome   : null,
    which === 'renderDetail' ? mod?.startDetail : null,
    which === 'renderAbout'  ? mod?.startAbout  : null,
  ].filter(Boolean);
  const fn = fns[0];
  if (typeof fn === 'function') return fn(...args);
  throw new Error(`View module missing ${which}() export`);
}

const loadHome   = () => importWithVersion('./home.v263.js');
const loadDetail = () => importWithVersion('./detail.v263.js');
const loadAbout  = () => importWithVersion('./about.v263.js');

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
      callRender(mod, 'renderAbout');
    } else if (hash.startsWith('#/post/')) {
      const id = hash.split('/')[2];
      const mod = await loadDetail();
      callRender(mod, 'renderDetail', id);
    } else {
      const mod = await loadHome();
      callRender(mod, 'renderHome');
    }
  } catch (err) {
    console.error('[OkObserver] Router error:', err);
    app.innerHTML = `
      <div style="padding:1rem;color:#b00020;">
        <strong>Failed to load view.</strong><br/>
        <code>${String(err)}</code>
      </div>`;
  }
}

// Re-render on hash changes
window.addEventListener('hashchange', start);
