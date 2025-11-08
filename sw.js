/* 🟢 sw.js | OkObserver Build 2025-11-07SR1-restoreHeaderSW1
   Clean UTF-8, versioned cache purge, offline fallback, GH Pages safe. */

'use strict';

const SW_VERSION = '2025-11-07SR1-restoreHeaderSW1';
const CACHE_NAME = `okobserver-cache-${SW_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './override.css',
  './main.js?v=2025-11-07SR1-restoreHeaderSW1',
  './logo.png',
  './favicon.ico',
  './offline.html'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k.startsWith('okobserver-cache-') && k !== CACHE_NAME) ? caches.delete(k) : null))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  const req = evt.request;

  // Only GET; let other verbs pass through
  if (req.method !== 'GET') return;

  // Network-first for HTML; cache-first for static assets
  if (req.headers.get('accept')?.includes('text/html')) {
    evt.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(()=>{});
        return r;
      }).catch(() => caches.match(req).then(r => r || caches.match('./offline.html')))
    );
    return;
  }

  evt.respondWith(
    caches.match(req).then(r => r || fetch(req).then(net => {
      const copy = net.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(()=>{});
      return net;
    }).catch(() => {
      // As a last resort, offline page for navigations
      if (req.mode === 'navigate') return caches.match('./offline.html');
      return Promise.reject(new Error('Network fail (non-HTML)'));
    }))
  );
});
/* 🔴 sw.js */
