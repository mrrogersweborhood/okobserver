/* global self, caches, fetch */
const BUILD_VERSION = '0.1';
const STATIC_CACHE = `okobs-static-${BUILD_VERSION}`;
const RUNTIME_CACHE = `okobs-runtime-${BUILD_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles/override.css?v='+BUILD_VERSION,
  '/src/main.js?v='+BUILD_VERSION,
  '/src/lib/util.js?v='+BUILD_VERSION,
  '/src/lib/api.js?v='+BUILD_VERSION,
  '/src/views/Home.js?v='+BUILD_VERSION,
  '/src/views/PostDetail.js?v='+BUILD_VERSION,
  '/src/views/About.js?v='+BUILD_VERSION,
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => ![STATIC_CACHE, RUNTIME_CACHE].includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const isAPI = url.pathname.includes('/wp-json/wp/v2');
  if (isAPI) {
    e.respondWith((async () => {
      try {
        const res = await fetch(e.request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(e.request, res.clone());
        return res;
      } catch (err) {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        throw err;
      }
    })());
  } else {
    e.respondWith((async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      const res = await fetch(e.request);
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(e.request, res.clone());
      return res;
    })());
  }
});
