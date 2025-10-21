import { qs, on, BUILD_VERSION } from './lib/util.js';
import Home from './views/Home.js';
import PostDetail from './views/PostDetail.js';
import About from './views/About.js';

console.log('[OkObserver] Entry v', BUILD_VERSION);

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
  if (m[0] === 'post' && m[1]) return { route: 'post', id: m[1] };
  return { route: 'home' };
}

function router(){
  const r = parseHash();
  if (r.route === 'home') mount(Home());
  else if (r.route === 'about') mount(About());
  else if (r.route === 'post') mount(PostDetail({ id: r.id }));
}

on(window, 'hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('year').textContent = new Date().getFullYear();
  router();
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
