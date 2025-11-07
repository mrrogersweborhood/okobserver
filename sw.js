/* 🟢 sw.js — OkObserver Service Worker
   Build: 2025-11-06SR1-perfSWR1-hotfix3p
   Strategy:
     - App shell: cache-first with versioned cache.
     - API (okobserver-proxy … /wp-json/wp/v2/): network-first, fallback to cache if available.
     - Stale cache short-circuit on version change: old caches purged in activate().
     - Optional offline fallback for navigations -> offline.html (if present).
*/

const VER = '2025-11-06SR1-perfSWR1-hotfix3p';
const CACHE_SHELL = `oko-shell-${VER}`;
const CACHE_DATA  = `oko-data-${VER}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './override.css?v=2025-11-06SR1-gridLock1-hotfix3n',
  './main.js?v=2025-11-06SR1-perfSWR1-hotfix3p',
  './logo.png',
  './favicon.ico',
  './offline.html', // optional, if missing it's ignored
];

const API_HOST = 'okobserver-proxy.bob-b5c.workers.dev';
const API_PATH = '/wp-json/wp/v2/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then((c) => c.addAll(SHELL_ASSETS.filter(Boolean))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => ![CACHE_SHELL, CACHE_DATA].includes(k)).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Helper: is this a WP API request?
function isAPI(req) {
  try {
    const u = new URL(req.url);
    return u.hostname === API_HOST && u.pathname.startsWith(API_PATH);
  } catch { return false; }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET.
  if (req.method !== 'GET') return;

  // Network-first for API (keeps content fresh).
  if (isAPI(req)) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req, { cache: 'no-store' });
        const clone = net.clone();
        const c = await caches.open(CACHE_DATA);
        c.put(req, clone);
        return net;
      } catch {
        const c = await caches.open(CACHE_DATA);
        const hit = await c.match(req);
        if (hit) return hit;
        // Last resort: generic Response
        return new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' }});
      }
    })());
    return;
  }

  // For navigations: try network, then shell, then offline page if present.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        return net;
      } catch {
        const cache = await caches.open(CACHE_SHELL);
        return (await cache.match('./index.html')) ||
               (await cache.match('./offline.html')) ||
               new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Cache-first for static shell assets.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_SHELL);
    const hit = await cache.match(req, { ignoreSearch: false });
    if (hit) return hit;
    try {
      const net = await fetch(req);
      if (net.ok && (req.url.startsWith(self.location.origin))) {
        cache.put(req, net.clone());
      }
      return net;
    } catch {
      // If offline and not cached, fall back to offline page for HTML
      if (req.headers.get('Accept')?.includes('text/html')) {
        return (await cache.match('./offline.html')) || new Response('Offline', { status: 503 });
      }
      throw;
    }
  })());
});
/* 🔴 sw.js */
