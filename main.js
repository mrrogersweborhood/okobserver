// 🟢 main.js — v2025-10-28j
// Router with console tracing, safe boot, and hamburger wiring.
// Modules:
//   Home.js        v2025-10-28f   (throttled prefetch scheduler)
//   PostDetail.js  v2025-10-29a   (defensive video + body fallback + tags)
//   About.js       v2025-10-27a
//   Settings.js    v2025-10-27a
// Service Worker:  v2025-10-28j
// CSS:             v2025-10-27i

const VER = '2025-10-28j'; // keep in sync with sw.js token and index.html ?v=

// ------------------------------
// Utilities
// ------------------------------
const log  = (...a) => console.log('[OkObserver]', ...a);
const warn = (...a) => console.warn('[OkObserver]', ...a);
const err  = (...a) => console.error('[OkObserver]', ...a);

function $(sel, root = document) { return root.querySelector(sel); }
function mountEl() {
  const m = $('#app');
  if (!m) throw new Error('#app mount not found');
  return m;
}

// ------------------------------
// Service Worker
// ------------------------------
(function registerSW(){
  if (!('serviceWorker' in navigator)) { warn('SW not supported'); return; }
  try {
    navigator.serviceWorker.register(`./sw.js?v=${VER}`)
      .then(r => log('SW registered ▸', r))
      .catch(e => warn('SW failed', e));
  } catch(e){ warn('SW exception', e); }
})();

// ------------------------------
// Hamburger (injected button)
// ------------------------------
function setupHamburger() {
  const header = $('.site-header .brand');
  if (!header || $('.nav-toggle', header)) return;

  const btn = document.createElement('button');
  btn.className = 'nav-toggle';
  btn.setAttribute('aria-label', 'Menu');
  btn.innerHTML = '<span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span>';
  header.appendChild(btn);

  const toggle = () => {
    const open = document.body.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  btn.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.body.classList.remove('nav-open');
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) document.body.classList.remove('nav-open');
  });

  // Close menu when navigating via header links
  document.addEventListener('click', (e) => {
    const a = e.target?.closest?.('a[href^="#/"]');
    if (a) document.body.classList.remove('nav-open');
  });
}

// ------------------------------
// Simple router
// ------------------------------
let navigating = false;

async function router() {
  if (navigating) return;
  navigating = true;

  const t0 = performance.now();
  const hash = (location.hash || '#/').replace(/\/+$/,''); // normalize trailing slash
  const mount = mountEl();

  log('route start', { hash });

  try {
    // Routes: #/post/123, #/about, #/settings, default: home
    if (hash.startsWith('#/post/')) {
      const id = hash.split('/')[2];
      if (!id) throw new Error('Missing post id');
      mount.innerHTML = '<div class="loading">Loading post…</div>';
      const { renderPost } = await import(`./PostDetail.js?v=2025-10-29a`);
      await renderPost(mount, id);
      log('route done: post', { id, ms: Math.round(performance.now() - t0) });
    }
    else if (hash === '#/about') {
      mount.innerHTML = '<div class="loading">Loading…</div>';
      const { renderAbout } = await import(`./About.js?v=2025-10-27a`);
      await renderAbout(mount);
      log('route done: about', { ms: Math.round(performance.now() - t0) });
    }
    else if (hash === '#/settings') {
      mount.innerHTML = '<div class="loading">Loading…</div>';
      const { renderSettings } = await import(`./Settings.js?v=2025-10-27a`);
      await renderSettings(mount);
      log('route done: settings', { ms: Math.round(performance.now() - t0) });
    }
    else {
      // Home
      mount.innerHTML = '<div class="loading">Loading posts…</div>';
      const { renderHome } = await import(`./Home.js?v=2025-10-28f`);
      await renderHome(mount);
      log('route done: home', { ms: Math.round(performance.now() - t0) });
    }
  } catch (e) {
    err('route error', e);
    mount.innerHTML = `
      <div class="container error">
        <p>Something went wrong loading this view.</p>
        <p style="opacity:.8">${(e && e.message) ? e.message : e}</p>
        <p><a class="btn btn-primary" href="#/">Back to Posts</a></p>
      </div>`;
  } finally {
    navigating = false;
  }
}

// ------------------------------
// Boot
// ------------------------------
function boot() {
  setupHamburger();

  // Route changes
  window.addEventListener('hashchange', router, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // place to refresh lightweight data in future
    }
  });

  // First route
  router();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
// 🔴 main.js
