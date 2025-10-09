// main.js — entry module
// Force/lock absolute API base to Cloudflare Worker on GitHub Pages
// v2.5.4

import { start } from './core.js';

function normalizeToWpV2(base) {
  if (!base) return null;
  if (/^https?:\/\//i.test(base)) base = base.replace(/\/+$/,'');
  else if (base.startsWith('/')) base = `${location.origin}${base.replace(/\/+$/,'')}`;
  else base = `https://${base.replace(/\/+$/,'')}`;
  if (!/\/wp\/v2$/i.test(base)) base += '/wp/v2';
  return base;
}

(() => {
  const LOCK_KEY = '__oko_api_base_lock';

  // Wipe stale lock that pointed to relative /api/wp/v2
  try { sessionStorage.removeItem(LOCK_KEY); } catch {}

  // Base from index.html (pre-set) or fallback
  let base = window.OKO_API_BASE || (location.hostname.endsWith('github.io')
    ? 'https://okobserver-proxy.bob-b5c.workers.dev'
    : `${location.origin}/api`);

  base = normalizeToWpV2(base);

  try { sessionStorage.setItem(LOCK_KEY, base); } catch {}
  window.OKO_API_BASE = base;

  console.info('[OkObserver] API base (locked):', base);
})();

start();
