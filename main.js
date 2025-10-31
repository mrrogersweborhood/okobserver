/* main.js — v2025-10-30q
   OkObserver SPA router, fetch, and UI manager
   -----------------------------------------------------
   - Updated cache-busting for PostDetail.js?v=2025-10-30q
   - Retains MutationObserver grid fix & infinite scroll
   - Includes load timing console logs
   - Adds passive offline toast controller
*/

const VER = '2025-10-30q';
const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
const HOME_MODULE = './Home.js?v=2025-10-27b';
const DETAIL_MODULE = './PostDetail.js?v=2025-10-30q';
const SW_FILE = `sw.js?v=${VER}`;

console.log(`[OkObserver] Build ${VER}`);

// Root containers
const app = document.getElementById('app');
const header = document.querySelector('.site-header');

// --------------- ROUTER ---------------
async function router() {
  const hash = location.hash || '#/';
  const [path, query] = hash.split('?');
  const mount = document.getElementById('app');
  if (!mount) return;

  const params = new URLSearchParams(query || '');
  const id = params.get('id');
  const tag = params.get('tag');

  const start = performance.now();

  if (path === '#/' || path === '#') {
    const { renderHome } = await import(HOME_MODULE);
    await renderHome(mount, { tag });
  } else if (path === '#/post' && id) {
    const { renderPost } = await import(DETAIL_MODULE);
    await renderPost(mount, id);
  } else {
    mount.innerHTML = `<div class="container"><p>Page not found.</p></div>`;
  }

  const end = performance.now();
  console.log(`[OkObserver] Route ${path} loaded in ${(end - start).toFixed(0)} ms`);
}

// --------------- GRID ENFORCER ---------------
function enforceGrid() {
  const grid = document.querySelector('.post-grid');
  if (!grid) return;
  const count = grid.querySelectorAll('.post-card').length;
  if (count) grid.classList.add('ready');
}

const gridObserver = new MutationObserver(enforceGrid);
function watchGrid() {
  const grid = document.querySelector('.post-grid');
  if (grid) {
    gridObserver.observe(grid, { childList: true });
    enforceGrid();
  }
}

// --------------- EVENT LISTENERS ---------------
window.addEventListener('hashchange', router);
window.addEventListener('load', async () => {
  await router();
  watchGrid();
  registerSW();
});

// --------------- SERVICE WORKER ---------------
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register(SW_FILE);
    console.log('[OkObserver] SW registered:', SW_FILE);
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch (err) {
    console.warn('[OkObserver] SW failed:', err);
  }
}

// --------------- UTILS ---------------
/* If other modules want the API base on window, expose it */
window.API_BASE = API_BASE;

// Lazy scroll restoration
window.addEventListener('popstate', () => {
  const scrollY = sessionStorage.getItem('scrollY');
  if (scrollY) window.scrollTo(0, parseInt(scrollY));
});

// Preserve scroll position between routes
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#/post"]');
  if (link) {
    sessionStorage.setItem('scrollY', window.scrollY);
  }
});

/* --------------- Passive Offline Toast --------------- */
(function netToast(){
  const t = document.getElementById('net-toast');
  if (!t) return;
  const show = (msg) => { if (msg) t.textContent = msg; t.hidden = false; requestAnimationFrame(()=>t.classList.add('show')); };
  const hide = () => { t.classList.remove('show'); setTimeout(()=>{ t.hidden = true; }, 220); };

  // Show a hint if we start offline
  if (!navigator.onLine) show("You’re offline. Showing cached content.");

  // Listen for connectivity changes
  window.addEventListener('offline', () => show("You’re offline. Showing cached content."));
  window.addEventListener('online',  () => { t.textContent = "Back online."; setTimeout(hide, 1200); });

  // Optional: global event to indicate API failure from modules
  window.addEventListener('okobserver:api-fail', () => show("Network error. Showing cached content."));
})();
