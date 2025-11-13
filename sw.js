// 🟢 sw.js — start of full file
/* OkObserver Service Worker — Build 2025-11-12R1h11
   Single filename: sw.js
   Scope: /okobserver/
   HTML: network-first; static assets: cache-first
   Deduped precache to avoid "duplicate requests" errors.
*/
const SW_BUILD   = '2025-11-12R1h11';
const CACHE_NAME = 'okobserver-thiscache-' + SW_BUILD;

// Keep paths explicit for GitHub Pages subpath
const PRECACHE = [
  '/okobserver/',
  '/okobserver/index.html?v=2025-11-12H3',
  '/okobserver/override.css?v=2025-11-07SR4',
  '/okobserver/main.js?v=2025-11-12R1h11',
  '/okobserver/PostDetail.js?v=2025-11-10R6',
  '/okobserver/logo.png',
  '/okobserver/favicon.ico'
];

// Deduplicate & normalize
const UNIQUE_ASSETS = [...new Set(PRECACHE.map(u => new URL(u, self.location.origin).toString()))];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(UNIQUE_ASSETS);
      await self.skipWaiting();
    } catch (err) {
      // Never fail install due to a single bad request
      console.warn('[OkObserver SW] install warning:', err);
      await self.skipWaiting();
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
    console.log('[OkObserver SW] active', SW_BUILD);
  })());
});

function isHTML(req){
  return req.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (isHTML(req)) {
    // Network-first for documents, fallback to cached index
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(req, { ignoreSearch:true })) ||
               (await cache.match('/okobserver/index.html?v=2025-11-12H3')) ||
               new Response('<h1>Offline</h1>', { headers:{'Content-Type':'text/html'} });
      }
    })());
    return;
  }

  // Cache-first for static assets
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});
// 🔴 sw.js — end of full file
