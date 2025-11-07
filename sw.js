/* 🟢 sw.js — OkObserver Service Worker (Build 2025-11-07SR1-perfSWR1-hotfix3s) */
/* UTF-8, no BOM — verified clean for GitHub Pages */

const VER = '2025-11-07SR1-perfSWR1-hotfix3s';
const CACHE = `okobserver-${VER}`;
const PRECACHE = [
  './',
  './index.html',
  './main.js',
  './override.css',
  './logo.png',
  './favicon.ico',
  './offline.html'
];

/* === INSTALL: Cache Core Assets === */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

/* === ACTIVATE: Clear Old Caches === */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* === FETCH: Network-First with Offline Fallback === */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Optionally cache GET responses for reuse
        if (req.method === 'GET' && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(
          (cached) => cached || caches.match('./offline.html')
        )
      )
  );
});

/* === MESSAGE: Manual Version Flush === */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    );
  }
});

/* === LOG VERSION === */
console.log('[SW] OkObserver active', VER);
/* 🔴 sw.js — end of file */
