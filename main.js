// main.js — entry module
// Force/lock absolute API base and boot app
// v2.4.9

import { start } from './core.js';

function normalizeBase(base) {
  if (!base) return null;
  // Already absolute?
  if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/,'') + '/wp/v2';
  // Starts with slash? make absolute with origin
  if (base.startsWith('/')) return `${location.origin}${base.replace(/\/+$/,'')}/wp/v2`;
  // Fallback: assume worker absolute
  return `https://${base.replace(/\/+$/,'')}/wp/v2`;
}

(() => {
  const LOCK_KEY = '__oko_api_base_lock';

  // Prefer explicit global if set
  let base = window.OKO_API_BASE;

  // On GitHub Pages, always use the Worker
  const onGitHubPages = /github\.io$/i.test(location.hostname);
  if (onGitHubPages) {
    base = 'https://okobserver-proxy.bob-b5c.workers.dev';
  }

  // If still not set, fall back to same-origin proxy (for local dev)
  if (!base) {
    base = `${location.origin}/api`;
  }

  // Normalize to absolute + /wp/v2 suffix
  base = normalizeBase(base);

  // Force override any stale lock each boot
  try {
    sessionStorage.setItem(LOCK_KEY, base);
  } catch {}
  window.OKO_API_BASE = base;

  console.info('[OkObserver] API base (locked):', base);
})();

// Start the app
start();
