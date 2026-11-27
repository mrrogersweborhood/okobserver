// 🟢 sw.js
/* 🟢 sw.js
   OkObserver Service Worker — Build 2025-12-16R1
   Scope: wherever the app is hosted
   Strategy:
   - NEVER cache non-GET (fixes "Cache.put POST is unsupported")
   - HTML (navigation): network-first, offline fallback to cached index.html
   - Static assets: cache-first with guarded network fill
   🔴 sw.js */

const SW_BUILD = '2.3.2';
const CACHE_NAME = 'okobserver-cache-' + SW_BUILD;

// Explicit precache list (root-scope paths)
// Base path follows wherever the app is hosted (/okobserver/ on github.io, / on app.okobserver.org)
const BASE = new URL(self.registration.scope).pathname;
const PRECACHE = ['', 'index.html', 'frame.html', 'override.css', 'main.js', 'PostDetail.js', 'logo.png', 'favicon-o.png'].map((p) => BASE + p);

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
        // frame.html has its own offline copy; every other page falls back to the app itself
        const match = (url.pathname === BASE + 'frame.html' && await cache.match(BASE + 'frame.html'))
          || await cache.match(BASE + 'index.html');

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

      // Match exact asset request so ?v= cache-busting continues to work
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);

        // Guard cache.put
       if (
  fresh &&
  fresh.ok &&
  fresh.status === 200 &&
  fresh.type !== 'opaque' &&
  url.origin === location.origin
) {
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
