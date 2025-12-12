// 🟢 sw.js — start of full file
/* OkObserver Service Worker — Build 2025-11-25-SWfix1
   Scope: /okobserver/
   Strategy:
   - HTML (navigation): network-first, offline fallback to cached index.
   - Static assets (CSS/JS/images): cache-first with guarded network fill.
*/

const SW_BUILD   = '2025-12-12-r100';
const CACHE_NAME = 'okobserver-cache-' + SW_BUILD;

// Explicit precache list
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
        Promise.all(
          keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))
        )
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
// Never cache non-GET (fixes "Cache.put POST is unsupported")
if (req.method !== 'GET') {
  event.respondWith(fetch(req));
  return;
}

  // HTML navigation → pure network-first, no dynamic caching
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
            headers: { 'Content-Type': 'text/html' }
          })
        );
      })
    );
    return;
  }

  // Other assets → cache-first with guarded network fill
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok && fresh.status === 200 && fresh.type !== 'opaque') {
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        // If we had a cached version, we already returned it above.
        return new Response('', { status: 504 });
      }
    })
  );
});
// 🔴 sw.js — end of full file
