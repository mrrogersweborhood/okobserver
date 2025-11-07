/* 🟢 sw.js — OkObserver Service Worker
   Build: 2025-11-07SR1-perfSWR1-hotfix3q
   Purpose:
     - Cache-first app shell (HTML, CSS, JS, logo)
     - Network-first WordPress API fetch
     - Version-based cache invalidation
     - Optional offline fallback (offline.html)
*/

const VER = '2025-11-07SR1-perfSWR1-hotfix3q';
const CACHE_SHELL = `oko-shell-${VER}`;
const CACHE_DATA  = `oko-data-${VER}`;
const API_HOST = 'okobserver-proxy.bob-b5c.workers.dev';
const API_PATH = '/wp-json/wp/v2/';

const SHELL_ASSETS = [
  './',
  './index.html',
  './override.css?v=2025-11-06SR1-gridLock1-hotfix3n',
  './main.js?v=2025-11-06SR1-perfSWR1-hotfix3p',
  './logo.png',
  './favicon.ico',
  './offline.html'
];

// ------------------------------
// INSTALL
// ------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then(cache => cache.addAll(SHELL_ASSETS.filter(Boolean)))
      .then(() => self.skipWaiting())
  );
});

// ------------------------------
// ACTIVATE — Purge old caches
// ------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => ![CACHE_SHELL, CACHE_DATA].includes(k))
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
    console.log(`[SW] Activated ${VER}`);
  })());
});

// ------------------------------
// Fetch helper: Is API request?
// ------------------------------
function isAPI(req) {
  try {
    const u = new URL(req.url);
    return u.hostname === API_HOST && u.pathname.startsWith(API_PATH);
  } catch {
    return false;
  }
}

// ------------------------------
// FETCH HANDLER
// ------------------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  // API requests → network first
  if (isAPI(req)) {
    event.respondWith((async () => {
      try {
        const netRes = await fetch(req, { cache: 'no-store' });
        const clone = netRes.clone();
        const cache = await caches.open(CACHE_DATA);
        cache.put(req, clone);
        return netRes;
      } catch {
        const cache = await caches.open(CACHE_DATA);
        const hit = await cache.match(req);
        return hit || new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
    return;
  }

  // Navigations → try network, then cached shell, then offline.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const netRes = await fetch(req);
        return netRes;
      } catch {
        const cache = await caches.open(CACHE_SHELL);
        return (await cache.match('./index.html')) ||
               (await cache.match('./offline.html')) ||
               new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Static shell assets → cache first
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_SHELL);
    const hit = await cache.match(req, { ignoreSearch: false });
    if (hit) return hit;

    try {
      const netRes = await fetch(req);
      if (netRes.ok && req.url.startsWith(self.location.origin)) {
        cache.put(req, netRes.clone());
      }
      return netRes;
    } catch {
      if (req.headers.get('Accept')?.includes('text/html')) {
        return (await cache.match('./offline.html')) || new Response('Offline', { status: 503 });
      }
      throw;
    }
  })());
});

// ------------------------------
// OPTIONAL: Message listener for skipWaiting
// ------------------------------
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* 🔴 sw.js */
