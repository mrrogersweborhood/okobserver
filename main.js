// main.js — OkObserver boot + API base lock (v2.5.4 patched)

// Keep: logs entry so we can confirm fresh load in Console
console.log("[OkObserver] Entry loaded: v2.5.4");

// ------------------------------
// 1) Lock API base to Cloudflare Worker on GH Pages
// ------------------------------
(function configureApiBase() {
  const isGitHubPages = location.hostname.endsWith('github.io');
  const workerBase = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const relativeBase = `${location.origin}/api/wp-json/wp/v2`;
  let base = isGitHubPages ? workerBase : relativeBase;

  const hash = location.hash || '';
  if (hash.includes('useWorker')) base = workerBase;
  if (hash.includes('useRelative')) base = relativeBase;

  Object.defineProperty(window, 'OKO_API_BASE', {
    value: base, writable: false, configurable: false, enumerable: true
  });
  console.log('[OkObserver] API base (locked):', window.OKO_API_BASE);
})();

// ------------------------------
// 2) Single-boot router with cache-busted core
//    - Avoids double-start by guarding with __okBooted
//    - Uses ?v= token to break browser cache on deploy
// ------------------------------
(async function bootOnce() {
  if (window.__okBooted) return;
  window.__okBooted = true;

  // Wait for DOM if needed
  if (document.readyState === 'loading') {
    await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  }

  const V = '2025-10-15a'; // bump this to force fresh core on deploy
  try {
    const core = await import(`./core-fixed.js?v=${V}`);
    if (typeof core.start === 'function') {
      await core.start();
    } else {
      console.warn('[OkObserver] core-fixed.js loaded without start()');
    }
  } catch (err) {
    console.error('OkObserver failed to start', err);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div style="padding:1rem;color:#b00020">
          <strong>App failed to start.</strong><br/>
          <small>${String(err)}</small>
        </div>`;
    }
  }
})();

// ------------------------------
// 3) One-time: unregister any old Service Workers
//    (prevents stale caching from older builds)
// ------------------------------
if ('serviceWorker' in navigator) {
  try {
    navigator.serviceWorker.getRegistrations?.().then(regs => {
      regs.forEach(r => r.unregister());
    });
  } catch (e) {
    console.warn('[SW] unregister skipped:', e);
  }
}
