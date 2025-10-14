// main.js — OkObserver stable bootstrap (v=265)
console.log('[OkObserver] main.js v2.6.5 booting');

(async () => {
  // Global config (kept unchanged for your Cloudflare Worker)
  window.OKO = window.OKO || {};
  window.OKO.API_BASE =
    window.OKO.API_BASE ||
    'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

  // Load router/start from core-fixed.js (no legacy filenames)
  const { default: start } = await import('./core-fixed.js?v=265');
  await start();
})();
