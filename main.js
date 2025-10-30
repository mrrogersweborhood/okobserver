// main.js — v2025-10-30g
// Router, SW registration, dynamic imports, and hard 4/3/1 grid lock

const VER = '2025-10-30g';
console.log(`[OkObserver] App version ${VER} loaded`);

const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
console.log('[OkObserver] API base:', API_BASE);

// -------- ROUTER --------
async function router() {
  const hash = location.hash || '#/';
  const mount = document.getElementById('app');
  if (!mount) return console.warn('[OkObserver] No mount point found.');

  if (hash === '#/' || hash === '#') {
    const { renderHome } = await import('./Home.js?v=2025-10-28f');
    renderHome(mount);
    return;
  }

  if (hash.startsWith('#/post/')) {
    const id = hash.split('/')[2];
    const { renderPost } = await import('./PostDetail.js?v=2025-10-30k');
    renderPost(mount, id);
    return;
  }

  if (hash === '#/about') {
    const { renderAbout } = await import('./About.js?v=2025-10-27a');
    renderAbout(mount);
    return;
  }

  if (hash === '#/settings') {
    const { renderSettings } = await import('./Settings.js?v=2025-10-27a');
    renderSettings(mount);
    return;
  }

  mount.innerHTML = `<div class="container"><p>Page not found.</p></div>`;
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);

// -------- SERVICE WORKER --------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`./sw.js?v=${VER}`)
      .then(reg => console.log('[OkObserver] SW registered ▸', reg))
      .catch(err => console.warn('[OkObserver] SW registration failed ▸', err));
  });
}

/* -------- GRID ENFORCER (hard 4/3/1) -------- */
function applyGridColumns() {
  const grid = document.querySelector('.post-grid');
  if (!grid) return;

  const w = window.innerWidth;
  const cols = (w >= 1200) ? 4 : (w >= 768 ? 3 : 1);
  const desired = `repeat(${cols}, minmax(0, 1fr))`;

  if (grid.style.gridTemplateColumns !== desired) {
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = desired;
    grid.style.gap = grid.style.gap || '24px';
  }
}

function throttle(fn, ms) {
  let t = 0;
  return () => {
    const now = Date.now();
    if (now - t >= ms) { t = now; fn(); }
  };
}

const gridObserver = new MutationObserver(() => applyGridColumns());
gridObserver.observe(document.body, { childList: true, subtree: true });

window.addEventListener('resize', throttle(applyGridColumns, 150));
window.addEventListener('hashchange', () => setTimeout(applyGridColumns, 0));
document.addEventListener('DOMContentLoaded', () => setTimeout(applyGridColumns, 0));

applyGridColumns();

// -------- FOOTER VERSION TAG --------
document.addEventListener('DOMContentLoaded', () => {
  const footer = document.querySelector('footer');
  if (footer && !footer.querySelector('.build-tag')) {
    const tag = document.createElement('div');
    tag.className = 'build-tag';
    tag.style.fontSize = '0.75em';
    tag.style.opacity = '0.6';
    tag.textContent = `Build ${VER}`;
    footer.appendChild(tag);
  }
});
