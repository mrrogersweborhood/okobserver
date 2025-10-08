// main.js — entry module
// Boots the app and locks the API base used by api.js
// v2.4.4

import { start } from './core.js';

// ---- Configure API base (visible in console for verification) ----
(() => {
  const LOCK_KEY = '__oko_api_base_lock';

  // Prefer an explicit global if you've set it earlier
  let base = window.OKO_API_BASE;

  // Auto-detect: on GitHub Pages use Cloudflare Worker; otherwise assume same-origin /api
  if (!base) {
    const onPages = /github\.io$/i.test(location.hostname);
    if (onPages) {
      base = 'https://okobserver-proxy.bob-b5c.workers.dev/wp/v2';
    } else {
      // If you host behind your own reverse proxy, adjust here:
      // e.g., base = `${location.origin}/api/wp/v2`;
      base = `${location.origin}/api/wp/v2`;
    }
  }

  // Expose and lock for api.js
  try {
    sessionStorage.setItem(LOCK_KEY, base);
  } catch {}
  window.OKO_API_BASE = base;

  console.info('[OkObserver] API base (locked):', base);
})();

// ---- Start the application ----
start();
