/* main.js — v2025-10-31c
   OkObserver SPA router, fetch, and UI manager
   -----------------------------------------------------
   - HARDEN grid-enforcer: reattach per route, force-ready, resize-aware
   - Extra post-render ticks to avoid 1-col regressions on desktop
   - Keeps SW cache-busting, router, and toast
*/

const VER = '2025-10-31c';
const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
const HOME_MODULE   = './Home.js?v=2025-10-27b';
const DETAIL_MODULE = './PostDetail.js?v=2025-10-31c';
const SW_FILE = `sw.js?v=${VER}`;

console.log(`[OkObserver] Build ${VER}`);

// Root containers
const app    = document.getElementById('app');
const header = document.querySelector('.site-header');

// ---------------- GRID ENFORCER (unbreakable) ----------------
let gridObserver;
let gridReadyTick = 0;

/** Add/refresh the 'ready' state on the post grid to ensure multi-column layout */
function enforceGrid() {
  const grid = document.querySelector('.post-grid');
  if (!grid) return;

  // If there are cards, ensure "ready" is set; some CSS depends on this flag.
  const cards = grid.querySelectorAll('.post-card');
  if (cards.length) {
    if (!grid.classList.contains('ready')) grid.classList.add('ready');
  }

  // Nudge layout after images load or when fonts settle
  // (these RAF/timeouts help when first paint is single-column)
  requestAnimationFrame(() => {
    grid.classList.add('ready'); // idempotent
  });
}

/** Observe the grid for child changes and re-apply 'ready' */
function attachGridObserver() {
  const grid = document.querySelector('.post-grid');
  if (!grid) return;

  // Disconnect any previous observer to avoid duplicates
  if (gridObserver) gridObserver.disconnect();

  gridObserver = new MutationObserver(() => {
    enforceGrid();
  });

  // Watch for new cards being appended during infinite scroll
  gridObserver.observe(grid, { childList: true, subtree: false });

  // Immediate passes: now, next frame, and a delayed sanity pass
  enforceGrid();
  requestAnimationFrame(enforceGrid);
  setTimeout(enforceGrid, 120);
  setTimeout(enforceGrid, 300);
}

/** Lightweight, debounced resize handler to keep columns correct on desktop */
let resizeTimer;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    enforceGrid();
  }, 80);
}
window.addEventListener('resize', onResize, { passive: true });

// ---------------- ROUTER ----------------
async function router() {
  const hash = location.hash || '#/';
  const [path, query] = hash.split('?');
  const mount = document.getElementById('app');
  if (!mount) return;

  const params = new URLSearchParams(query || '');
  const id  = params.get('id');
  const tag = params.get('tag');

  const start = performance.now();

  try {
    if (path === '#/' || path === '#') {
      const { renderHome } = await import(HOME_MODULE);
      await renderHome(mount, { tag });

      // After home renders, (re)attach our grid observer and force multi-col
      attachGridObserver();

    } else if (path === '#/post' && (id || params.get('id'))) {
      const postId = id || params.get('id');
      const { renderPost } = await import(DETAIL_MODULE);
      await renderPost(mount, postId);

      // No grid on detail, but if the view swaps back via hash, next route will reattach
    } else {
      mount.innerHTML = `<div class="container"><p>Page not found.</p></div>`;
    }
  } finally {
    const end = performance.now();
    console.log(`[OkObserver] Route ${path} loaded in ${(end - start).toFixed(0)} ms`);
  }
}

// ---------------- EVENT LISTENERS ----------------
window.addEventListener('hashchange', () => {
  router().then(() => {
    // A couple of post-route ticks to defeat “single column on first paint”
    requestAnimationFrame(attachGridObserver);
    setTimeout(attachGridObserver, 90);
  });
});

window.addEventListener('load', async () => {
  await router();
  attachGridObserver();
  registerSW();

  // If images load late, force a re-check (important when the first card image pops in)
  window.addEventListener('load', () => {
    // secondary window 'load' is harmless; ensures post-image layout fix
    setTimeout(attachGridObserver, 50);
  }, { once: true });
});

// ---------------- SERVICE WORKER ----------------
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register(SW_FILE);
    console.log('[OkObserver] SW registered:', SW_FILE);
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  } catch (err) {
    console.warn('[OkObserver] SW failed:', err);
  }
}

// ---------------- UTILS ----------------
/* If other modules want the API base on window, expose it */
window.API_BASE = API_BASE;

// Lazy scroll restoration
window.addEventListener('popstate', () => {
  const scrollY = sessionStorage.getItem('scrollY');
  if (scrollY) window.scrollTo(0, parseInt(scrollY, 10));
});

// Preserve scroll position between routes
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#/post"]');
  if (link) sessionStorage.setItem('scrollY', window.scrollY);
});

/* ---------------- Passive Offline Toast ---------------- */
(function netToast(){
  const t = document.getElementById('net-toast');
  if (!t) return;
  const show = (msg) => { if (msg) t.textContent = msg; t.hidden = false; requestAnimationFrame(()=>t.classList.add('show')); };
  const hide = () => { t.classList.remove('show'); setTimeout(()=>{ t.hidden = true; }, 220); };

  if (!navigator.onLine) show('You’re offline. Showing cached content.');
  window.addEventListener('offline', () => show('You’re offline. Showing cached content.'));
  window.addEventListener('online',  () => { t.textContent = 'Back online.'; setTimeout(hide, 1200); });

  // Global hook to indicate API failure from modules
  window.addEventListener('okobserver:api-fail', () => show('Network error. Showing cached content.'));
})();
