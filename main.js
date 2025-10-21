// /src/main.js
import { qs, on, BUILD_VERSION } from './lib/util.js';
import Home from './views/Home.js';
import PostDetail from './views/PostDetail.js';
import About from './views/About.js';
import Settings from './views/Settings.js';

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
      import('./lib/util.js').then(m => m.saveScroll && m.saveScroll());
    } catch {}
    mount(PostDetail({ id: r.id }));
  }
}

on(window, 'hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('year').textContent = new Date().getFullYear();
  router();
  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?ver='+BUILD_VERSION).then(reg => {
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing; nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[OkObserver] New SW installed');
          }
        });
      });
    }).catch(err => console.warn('SW register failed', err));
  }
});
