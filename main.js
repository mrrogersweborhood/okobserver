// main.js — OkObserver boot + API base lock (v2.5.4 patched)
console.log("[OkObserver] Entry loaded: v2.5.4");

// Lock API base (Cloudflare Worker on GitHub Pages)
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

// Router entry
import { start } from './core-fixed.js';
(async function boot() {
  if (window.__okBooted) return; window.__okBooted = true;
  if (document.readyState === 'loading') {
    await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  }
  try { await start(); }
  catch (err) {
    console.error('OkObserver failed to start', err);
    const app = document.getElementById('app');
    if (app) app.innerHTML = `<div style="padding:1rem;color:#b00020"><strong>App failed to start.</strong><br/><small>${String(err)}</small></div>`;
  }
})();
