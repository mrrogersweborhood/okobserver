// main.js — entry
import { router, saveScrollForRoute } from './core.js';

console.info('[OkObserver] Entry loaded:', window.APP_VERSION || '');

function boot(){
  // Always re-render on hash change (even if same route) so Back works
  window.addEventListener('hashchange', () => router(true), { passive:true });

  // Save scroll before unloading (fallback guard)
  window.addEventListener('beforeunload', () => {
    try { saveScrollForRoute(location.hash || '#/'); } catch {}
  });

  // First render
  router(true);
}

boot();
