// /main.js
import { qs, on, BUILD_VERSION, saveScroll } from './util.js';
import Home from './Home.js';
import PostDetail from './PostDetail.js';
import About from './About.js';
import Settings from './Settings.js';

console.log('[OkObserver] Entry v', BUILD_VERSION);

// Simple stateful router with teardown
let current = null;
function mount(view){
  const app = qs('#app');
  current?.unmount?.();
  current = view;
  view.mount(app);
}

function parseHash(){
  const m = location.hash.slice(1).split('/').filter(Boolean);
  if (m.length === 0) return { route: 'home' };
  if (m[0] === 'about') return { route: 'about' };
  if (m[0] === 'settings') return { route: 'settings' };
  if (m[0] === 'post' && m[1]) return { route: 'post', id: m[1] };
  return { route: 'home' };
}

function router(){
  const r = parseHash();
  if (r.route === 'home') {
    mount(Home());
  }
  else if (r.route === 'about') {
    mount(About());
  }
  else if (r.route === 'settings') {
    mount(Settings());
  }
  else if (r.route === 'post') {
    // Save scroll so Back can restore it
    try {
      saveScroll && saveScroll();
    } catch {}
    mount(PostDetail({ id: r.id }));
  }
}

on(window, 'hashchange', router);

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('year').textContent = new Date().getFullYear();
  router();

  // ✅ Service worker registration (auto-detect scope for GitHub Pages or root)
  if ('serviceWorker' in navigator) {
    const swURL = new URL('./sw.js?ver=' + BUILD_VERSION, import.meta.url);
    navigator.serviceWorker.register(swURL)
      .then(reg => {
        console.log('[OkObserver] SW registered at', swURL.href);
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });

        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw && nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[OkObserver] New SW installed');
            }
          });
        });
      })
      .catch(err => console.warn('[OkObserver] SW register failed', err));
  }
});
