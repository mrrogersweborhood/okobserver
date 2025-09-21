// core.js — entry & router
import { APP_VERSION, state, saveHomeCache, stateForSave, isHomeRoute, setRestoring, app, nextFrame } from './shared.js';
import { renderHome, attachScrollFallback } from './home.js';

window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

// Router
async function router(){
  // If user navigates mid-restore, unstick any pause
  setRestoring(false);
  const hash = window.location.hash || "#/";
  const m = hash.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);
  if (m && m[1]) {
    const { renderPost } = await import('./detail.js');
    renderPost(m[1]);
  } else {
    renderHome();
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
if (document.readyState === "interactive" || document.readyState === "complete") { router(); }

// Click delegation for card links
document.addEventListener('click', (e)=>{
  const link = e.target.closest('a.thumb-link, a.title-link');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  if (href.startsWith('#/post/')) {
    e.preventDefault();
    state.scrollY = window.scrollY || window.pageYOffset || 0;
    state.homeScrollY = state.scrollY;
    const id = Number(link.dataset.id || '') || null;
    if (id !== null) state.scrollAnchorPostId = id;
    state.returningFromDetail = true;
    try{ sessionStorage.setItem('__okCache', JSON.stringify(stateForSave(state))); }catch{}
    const old = location.hash;
    location.hash = href;
    if (old === href) router();
  }
});

// Track scroll position on Home only
window.addEventListener('scroll', function () {
  if (!isHomeRoute()) return;
  state.scrollY = window.scrollY || window.pageYOffset || 0;
}, { passive: true });

// Attach fallback paginator
attachScrollFallback();
