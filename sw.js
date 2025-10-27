// sw.js — v2025-10-27b
// Cache-first for app shell/static; network-first for JSON/API.
// After updating this file:
// 1) DevTools → Application → Service Workers → Unregister
// 2) Hard refresh twice (Ctrl/Cmd + Shift + R)

const VER   = '2025-10-27b';
const CACHE = `okobserver-cache-v${VER}`;

// Static app-shell files (same-origin). Adjust if your filenames differ.
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
    caches.open(CACHE)
      .then((cache) => cache.addAll(STATIC))
      .then(() => self.skipWaiting()) // ensure new SW takes control sooner
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : undefined)));
    await self.clients.claim(); // immediately control open tabs
  })());
});

// Strategy:
// - JSON/data (wp-json, api, *.json): Network-first → fallback to cache
// - Everything else (static/app shell): Cache-first → populate from network on miss
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const pathAndQuery = url.pathname + url.search;
  const isData = /\/(wp-json|api)(\/|$)|\.json($|\?)/i.test(pathAndQuery);

  if (isData) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        cache.put(req, net.clone());
        return net;
      } catch {
        const cached = await caches.match(req);
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Static / same-origin assets: cache-first
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    const net = await fetch(req);
    const cache = await caches.open(CACHE);
    cache.put(req, net.clone());
    return net;
  })());
});
