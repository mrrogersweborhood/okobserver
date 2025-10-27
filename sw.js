// sw.js — v2025-10-27c
// Cache-first for app shell/static; network-first for JSON/API.
// Updates in this version:
// ✅ Bumped VER → 2025-10-27c
// ✅ Added Navigation Preload for faster first paint
// ✅ Explicit cache cleanup (remove old caches by prefix)
// ✅ Slight fetch optimization (await Promise.all safely)

const VER   = '2025-10-27c';
const CACHE = `okobserver-cache-v${VER}`;
const CACHE_PREFIX = 'okobserver-cache-v';

// Static app shell files (same-origin). Adjust if your filenames differ.
const STATIC = [
  './',
  './index.html',
  './override.css?v=' + VER,
  './main.js?v=' + VER,
  './Home.js?v=' + VER,
  './PostDetail.js?v=' + VER,
  './About.js?v=' + VER,
  './Settings.js?v=' + VER,
  './util.js?v=' + VER,
  './api.js?v=' + VER,
  './logo.png',
  './favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(STATIC);
      await self.skipWaiting(); // ensure new SW activates immediately
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Enable navigation preload for faster first paint
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      // Remove old caches not matching this version
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (k.startsWith(CACHE_PREFIX) && k !== CACHE) {
            return caches.delete(k);
          }
        })
      );

      await self.clients.claim(); // take control of open clients immediately
    })()
  );
});

// Strategy:
// - JSON/data (wp-json, api, *.json): Network-first → fallback to cache
// - Everything else (static/app shell): Cache-first → update cache on network success
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const pathAndQuery = url.pathname + url.search;
  const isData = /\/(wp-json|api)(\/|$)|\.json($|\?)/i.test(pathAndQuery);

  // For WordPress API / JSON data — network-first
  if (isData) {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req, { cache: 'no-store' });
          const cache = await caches.open(CACHE);
          cache.put(req, net.clone());
          return net;
        } catch {
          const cached = await caches.match(req);
          return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // For static/shell assets — cache-first
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, net.clone());
        return net;
      } catch {
        // fallback if fetch fails
        const fallback = await caches.match('./index.html');
        return fallback || new Response('Offline', { status: 503 });
      }
    })()
  );
});
