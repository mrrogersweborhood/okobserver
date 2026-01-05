// 🟢 sw.js
/* 🟢 sw.js
   OkObserver Service Worker — Build 2025-12-16R1
   Scope: /okobserver/
   Strategy:
   - NEVER cache non-GET (fixes "Cache.put POST is unsupported")
   - HTML (navigation): network-first, offline fallback to cached index.html
   - Static assets: cache-first with guarded network fill
   🔴 sw.js */

const SW_BUILD = '2026-01-05R028';
const CACHE_NAME = 'okobserver-cache-' + SW_BUILD;

// Explicit precache list (root-scope paths)
const PRECACHE = [
  '/okobserver/',
  '/okobserver/index.html',
  '/okobserver/override.css',
  '/okobserver/main.js',
  '/okobserver/PostDetail.js',
  '/okobserver/logo.png',
  '/okobserver/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[OkObserver SW] install warning:', err);
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
      )
      .then(() => self.clients.claim())
  );
});

function isHTML(req) {
  return (
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // ✅ Critical: never cache non-GET (POST/PUT/etc). Just pass through.
  if (req.method !== 'GET') {
    event.respondWith(fetch(req));
    return;
  }
  // ✅ Auth/API safety: never cache WP API or auth endpoints in the SW
  // These can return different content when logged-in vs logged-out.
  const url = new URL(req.url);
  if (url.pathname.includes('/wp-json/') || url.pathname.includes('/auth/') || url.pathname.includes('/content/')) {

    event.respondWith(fetch(req));
    return;
  }

  // HTML navigation → network-first, offline fallback to cached index
  if (isHTML(req)) {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const match =
          (await cache.match(req, { ignoreSearch: true })) ||
          (await cache.match('/okobserver/index.html'));
        return (
          match ||
          new Response('<h1>Offline</h1>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          })
        );
      })
    );
    return;
  }

  // Other assets → cache-first (GET only)
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Match ignoring querystrings, since you use ?v= cache-busters in HTML
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const fresh = await fetch(req);

        // Guard cache.put
        if (fresh && fresh.ok && fresh.status === 200 && fresh.type !== 'opaque') {
          await cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        return new Response('', { status: 504 });
      }
    })()
  );
});

// 🔴 sw.js
