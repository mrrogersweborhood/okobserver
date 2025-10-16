/* ---------------------------------------------------
   sw.js — OkObserver Service Worker (Optimized)
   ---------------------------------------------------
   Goals:
   - Keep HTML/CSS/JS/icons cached for fast repeat loads
   - Serve API JSON with a network-first strategy to avoid stale data
   - Preserve existing behavior; all additions are safe and additive
--------------------------------------------------- */

const VERSION = 'oko-sw-v1-2025-10-16b';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Add whatever static assets you want pre-cached here (kept minimal to avoid bloat)
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.css',
  './override.css',
  './detail.css',
  './main.js',
  './core-fixed.js',
  './home.v263.js',
  './detail.v263.js',
  './about.v263.js',
  './favicon.ico',
  './icon.png'
];

// Install: pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

// Activate: cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(k => (k.startsWith('oko-sw-') && k !== STATIC_CACHE && k !== RUNTIME_CACHE) ? caches.delete(k) : Promise.resolve())
    );
    await self.clients.claim();
  })());
});

// Fetch: network-first for API JSON, cache-first for static, runtime cache for others
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // 1) Network-first for WP JSON API (prevents stale data)
  if (url.href.includes('/wp-json/wp/v2/')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-cache' });
        // Optionally update the runtime cache for offline fallback
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
    return;
  }

  // 2) Cache-first for static assets (HTML/CSS/JS/images)
  if (PRECACHE_URLS.some(p => url.pathname.endsWith(p.replace('./','/')))) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(resp => {
        // Update static cache with the latest copy
        return caches.open(STATIC_CACHE).then(cache => {
          cache.put(req, resp.clone());
          return resp;
        });
      }))
    );
    return;
  }

  // 3) Runtime cache fallback for other GET requests
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const resp = await fetch(req);
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, resp.clone());
      return resp;
    } catch (err) {
      // Last-resort fallback for navigation requests
      if (req.mode === 'navigate') {
        return caches.match('./index.html');
      }
      throw err;
    }
  })());
});

// Optional: skip waiting via message from client (useful during deploys)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
