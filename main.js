// main.js — entry module
// Force/lock absolute API base to Cloudflare Worker on GitHub Pages
// v2.5.1

import { start } from './core.js';

function normalizeToWpV2(base) {
  if (!base) return null;
  // absolute?
  if (/^https?:\/\//i.test(base)) {
    base = base.replace(/\/+$/,'');
  } else if (base.startsWith('/')) {
    base = `${location.origin}${base.replace(/\/+$/,'')}`;
  } else {
    base = `https://${base.replace(/\/+$/,'')}`;
  }
  // ensure /wp/v2 suffix
  if (!/\/wp\/v2$/i.test(base)) base += '/wp/v2';
  return base;
}

(() => {
  const LOCK_KEY = '__oko_api_base_lock';

  // Always reset any stale lock on page load (prevents relative api/wp/v2)
  try { sessionStorage.removeItem(LOCK_KEY); } catch {}

  // Default base
  let base = window.OKO_API_BASE;

  // On GitHub Pages, force Worker (absolute) every boot
  const onGitHubPages = /github\.io$/i.test(location.hostname);
  if (onGitHubPages) {
    base = 'https://okobserver-proxy.bob-b5c.workers.dev';
  }

  // Fallback (local dev behind your own proxy)
  if (!base) base = `${location.origin}/api`;

  // Normalize + add /wp/v2
  base = normalizeToWpV2(base);

  // Lock + expose globally for api.js
  try { sessionStorage.setItem(LOCK_KEY, base); } catch {}
  window.OKO_API_BASE = base;

  console.info('[OkObserver] API base (locked):', base);
})();

// Boot the app
start();
