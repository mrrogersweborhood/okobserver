/* 🟢 sw.js — OkObserver Service Worker
   Build 2025-11-04SR1
   Plain JS, network-first for posts, cache-first for static.
*/

const CACHE_NAME = 'okobserver-cache-2025-11-04SR1';
const STATIC_ASSETS = [
  './',
  './index.html?v=2025-11-04SR1',
  './main.js?v=2025-11-04SR1',
  './override.css?v=2025-11-04SR1',
  './favicon.ico',
  './logo.png',
  './manifest.json'
];

// 🔹 install — pre-cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 🔹 activate — clear old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// 🔹 fetch — network-first for JSON/posts, cache-first for everything else
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // bypass Chrome extensions & opaque requests
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  if (url.pathname.includes('/wp-json/wp/v2/posts')) {
    // network-first for API
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // cache-first for static resources
  event.respondWith(
    caches.match(request).then(res =>
      res ||
      fetch(request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => res)
    )
  );
});

// 🔹 optional: manual skipWaiting trigger
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
