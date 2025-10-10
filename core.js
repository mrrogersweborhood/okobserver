// core.js — app shell, routing, and scroll memory

// Public exports that other modules expect
export { start, navTo, saveScrollForRoute, restoreScrollPosition };

// Feature renderers (must exist as named exports in these files)
import { renderHome }  from './home.js';
import { renderPost }  from './detail.js';

// -------------------------
// DOM helpers
// -------------------------
const $ = (sel, root = document) => root.querySelector(sel);

// Strictly require the app outlet
function getApp() {
  const el = $('#app');
  if (!el) {
    console.error('[OkObserver] app container not found');
  }
  return el;
}

// -------------------------
// Router with hash paths
//   "/"                   → list
//   "/about"              → about page (rendered by home module if desired)
//   "/post/:id"           → post detail
// -------------------------
function parseRoute() {
  // hash like "#/post/381016?scroll=..."
  const raw = location.hash.replace(/^#/, '');
  const path = raw.split('?')[0] || '/';

  if (path === '/' || path === '') return { name: 'home' };
  if (path === '/about') return { name: 'about' };

  const m = path.match(/^\/post\/(\d+)$/);
  if (m) return { name: 'post', id: m[1] };

  return { name: 'notfound', raw: path };
}

async function router() {
  const app = getApp();
  if (!app) return;

  const route = parseRoute();
  // Save last route for scroll memory
  currentRoute = route;

  try {
    switch (route.name) {
      case 'home': {
        // If we have a saved scroll, restore after render
        await renderHome(app, { onLink: navTo });
        restoreScrollPosition('home');
        break;
      }
      case 'about': {
        // Home renderer can also handle about if you prefer; otherwise simple stub here:
        app.innerHTML = `
          <div class="post-shell">
            <div class="back-row"><a class="back-btn" href="#/">&larr; Back to posts</a></div>
            <h1 class="post-title" style="color:#111;margin-top:4px">About</h1>
            <div class="entry">
              <p>This is an unofficial demo client for <a href="https://okobserver.org" target="_blank" rel="noopener">The Oklahoma Observer</a>.</p>
            </div>
          </div>
        `;
        break;
      }
      case 'post': {
        // Hand off to detailed post renderer
        await renderPost(app, route.id, {
          onBack: () => {
            // Remember where we came from, then return
            saveScrollForRoute('home');
            navTo('/');
          }
        });
        break;
      }
      default: {
        // Not found view (keeps shell coherent)
        app.innerHTML = `
          <div class="post-shell">
            <div class="back-row"><a class="back-btn" href="#/">&larr; Back to posts</a></div>
            <h1 class="post-title" style="color:#111;margin-top:4px">Post not found</h1>
            <p class="meta">Sorry, we couldn’t load this post <code>${escapeHtml(route.raw || '')}</code>.</p>
          </div>
        `;
      }
    }
  } catch (err) {
    console.error('[OkObserver] Router error:', err);
    const msg = (err && err.message) ? err.message : String(err);
    app.innerHTML = `
      <div class="post-shell">
        <div class="back-row"><a class="back-btn" href="#/">&larr; Back to posts</a></div>
        <h1 class="post-title" style="color:#111;margin-top:4px">Something went wrong</h1>
        <p class="meta">${escapeHtml(msg)}</p>
      </div>
    `;
  }
}

// -------------------------
// Navigation + scroll memory
// -------------------------
function navTo(path) {
  if (!path.startsWith('#')) {
    location.hash = `#${path}`;
  } else {
    location.hash = path;
  }
}

let currentRoute = null;
const scrollMem = new Map();
/** Save scroll for a key (e.g., 'home') */
function saveScrollForRoute(key) {
  // Use the first scrollable root (documentElement) for consistent restore
  const y = document.scrollingElement ? document.scrollingElement.scrollTop : window.scrollY;
  scrollMem.set(key, y);
}

/** Restore previously saved scroll for a key; noop if none. */
function restoreScrollPosition(key) {
  const y = scrollMem.get(key);
  if (typeof y === 'number') {
    requestAnimationFrame(() => {
      (document.scrollingElement || window).scrollTo(0, y);
    });
  }
}

// When clicking "Back to posts", save before navigating
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a.back-btn');
  if (a && a.getAttribute('href') === '#/') {
    saveScrollForRoute('home');
  }
}, { capture: true });

// -------------------------
// App boot
// -------------------------
function onHashChange() {
  router();
}

function start() {
  console.log('[OkObserver] Router initializing…');
  window.addEventListener('hashchange', onHashChange);
  router();
}

// Utility
function escapeHtml(s) {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}
