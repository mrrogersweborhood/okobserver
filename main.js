// main.js  v=264 (no filename changes)
console.log('[OkObserver] Bootstrapping main.js v2.6.4');

(async () => {
  window.OKO = window.OKO || {};
  window.OKO.API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

  const mod = await import('./core-fixed.js?v=264');
  await mod.default();
})();
