// 🟢 sw.js | OkObserver Build 2025-11-12R1h2
/* Clean UTF-8, versioned cache purge, offline fallback, GH Pages safe.
   This update bumps the cache version to force browsers to fetch the new
   main.js (2025-11-12R1h2).  No logic changes, just a version refresh. */

'use strict';

const SW_VERSION = '2025-11-12R1h2';
const CACHE_NAME = `okobserver-cache-${SW_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './override.css',
  './main.js?v=2025-11-12R1h2',
  './logo.png',
  './favicon.ico',
  './offline.html'
];

// ----- INSTALL -----
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ----- ACTIVATE -----
self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k =>
          k.startsWith('okobserver-cache-') && k !== CACHE_NAME
            ? caches.delete(k)
            : null
        )
      )
    )
  );
  self.clients.claim();
});

// ----- FETCH -----
self.addEventListener('fetch', (evt) => {
  const req = evt.request;
  if (req.method !== 'GET') return;

  // Network-first for HTML, cache-first for static
  if (req.headers.get('accept')?.includes('text/html')) {
    evt.respondWith(
      fetch(req)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(()=>{});
          return r;
        })
        .catch(() =>
          caches.match(req).then(r => r || caches.match('./offline.html'))
        )
    );
    return;
  }

  evt.respondWith(
    caches.match(req).then(r =>
      r ||
      fetch(req)
        .then(net => {
          const copy = net.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(()=>{});
          return net;
        })
        .catch(() => {
          if (req.mode === 'navigate') return caches.match('./offline.html');
          return Promise.reject(new Error('Network fail (non-HTML)'));
        })
    )
  );
});

// 🔴 sw.js | end of file (Build 2025-11-12R1h2)
