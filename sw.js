// sw.js — v2025-10-24e
// Cache-first for app shell/static; network-first for JSON/API.
// NOTE: Replacing this file changes caching behavior. After updating:
// 1) DevTools → Application → Service Workers → Unregister
// 2) Hard refresh (Ctrl/Cmd + Shift + R)

const VER   = '2025-10-24e';
const CACHE = `okobserver-cache-v${VER}`;

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

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : undefined)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isData = /\/(wp-json|api|feed|\.json)($|\?)/i.test(url.pathname + url.search);

  if (isData) {
    // Network-first for dynamic/data requests
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const clone = net.clone(); // clone BEFORE returning
        const cache = await caches.open(CACHE);
        cache.put(req, clone);
        return net;
      } catch {
        const cached = await caches.match(req);
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Cache-first for same-origin static/app shell
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    const net = await fetch(req);
    const clone = net.clone(); // clone BEFORE returning
    const cache = await caches.open(CACHE);
    cache.put(req, clone);
    return net;
  })());
});
