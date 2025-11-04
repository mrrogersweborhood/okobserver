/* 🟢 sw.js — OkObserver Service Worker
   Build 2025-11-04SR1-fixA
   Strategy: network-first for API; cache-first for static.
   Plain JS (no ESM).
*/

const CACHE_NAME = 'okobserver-cache-2025-11-04SR1-fixA';

const STATIC_ASSETS = [
  './',
  './index.html?v=2025-11-04SR1-fixA',
  './main.js?v=2025-11-04SR1-fixA',
  './override.css?v=2025-11-04SR1-fixA',
  './favicon.ico',
  './logo.png',
  './manifest.json'
];

// Install: pre-cache static shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clear old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for WP API; cache-first for others
self.addEventListener('fetch', event => {
  const req = event.request;

  // Ignore extension/opaque requests
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  const url = new URL(req.url);

  // API: posts endpoint (network-first to keep feed fresh)
  if (url.pathname.includes('/wp-json/wp/v2/posts')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(req).then(cached =>
      cached ||
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      }).catch(() => cached)
    )
  );
});

// Optional: allow page to trigger immediate activation
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* 🔴 sw.js */
