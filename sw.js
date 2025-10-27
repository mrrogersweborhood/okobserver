// sw.js — v2025-10-27d
// Cache-first for app shell/static; network-first for JSON/API.
// Fix: properly use Navigation Preload by awaiting event.preloadResponse for navigations.

const VER   = '2025-10-27d';
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
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(STATIC);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Enable navigation preload for faster first paint
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    // Remove old caches not matching this version
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k.startsWith(CACHE_PREFIX) && k !== CACHE) ? caches.delete(k) : undefined)
    );
    await self.clients.claim();
  })());
});

// Strategy summary:
// - Navigations: prefer Navigation Preload, else network, else cached index.html
// - JSON/data (wp-json, api, *.json): network-first → fallback to cache
// - Other static: cache-first → populate cache on success
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const pathAndQuery = url.pathname + url.search;
  const isData = /\/(wp-json|api)(\/|$)|\.json($|\?)/i.test(pathAndQuery);

  // 1) Handle top-level navigations (HTML documents)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      // Try the preloaded response first (if navigation preload is enabled)
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
      } catch { /* ignore */ }

      // Network first for HTML
      try {
        const net = await fetch(req);
        // Optionally update cached index.html copy
        const cache = await caches.open(CACHE);
        cache.put('./index.html', net.clone());
        return net;
      } catch {
        // Fallback to cached shell (index.html)
        const cachedShell = await caches.match('./index.html');
        return cachedShell || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 2) WordPress API / JSON data — network-first
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

  // 3) Static assets — cache-first
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const net = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, net.clone());
      return net;
    } catch {
      const fallback = await caches.match('./index.html');
      return fallback || new Response('Offline', { status: 503 });
    }
  })());
});
