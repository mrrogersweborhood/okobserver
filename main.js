// main.js — v2025-10-30e
// Router, SW registration, dynamic imports for SPA modules

const VER = '2025-10-30e';
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
    // 🔹 Updated to latest PostDetail file
    const { renderPost } = await import('./PostDetail.js?v=2025-10-30e');
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

  // Default fallback
  mount.innerHTML = `<div class="container"><p>Page not found.</p></div>`;
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);

// -------- SERVICE WORKER --------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`./sw.js?v=${VER}`).then(reg => {
      console.log('[OkObserver] SW registered ▸', reg);
    }).catch(err => {
      console.warn('[OkObserver] SW registration failed ▸', err);
    });
  });
}

// -------- MUTATION OBSERVER GRID ENFORCER --------
// Keeps the grid layout consistent after dynamic content loads
const observer = new MutationObserver(() => {
  const grid = document.querySelector('.post-grid');
  if (grid) {
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
    grid.style.gap = '1rem';
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// -------- VERSION FOOTER --------
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
