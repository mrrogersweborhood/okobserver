/* sw.js — v2025-10-30s
   OkObserver service worker
   ---------------------------------------
   • Cache-first app shell (+ offline.html)
   • Network-first for JSON/API
   • Navigation fallback to offline page
   • Immediate activation (skipWaiting + claim)
   • Auto-cleans old caches
   • PRECACHE includes api.js?v=2025-10-30s
*/

const CACHE_VERSION = '2025-10-30s';
const STATIC_CACHE = `okobserver-static-${CACHE_VERSION}`;
const DATA_CACHE   = `okobserver-data-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './main.js?v=2025-10-30q',
  './Home.js?v=2025-10-30s',
  './PostDetail.js?v=2025-10-30q',
  './api.js?v=2025-10-30s',
  './override.css?v=2025-10-30q',
  './favicon.ico',
  './logo.png',
  './icon-192.png',
  './icon-512.png'
];

const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';

// -------- INSTALL --------
self.addEventListener('install', (event) => {
  console.log('[SW] Installing', CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// -------- ACTIVATE --------
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating', CACHE_VERSION);
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => ![STATIC_CACHE, DATA_CACHE].includes(k))
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
    console.log('[SW] Old caches cleared');
  })());
});

// -------- FETCH --------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only GET is cached/handled
  if (req.method !== 'GET') return;

  // 1) API requests → network-first
  if (url.href.startsWith(API_BASE)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 2) Navigations (HTML pages) → try network, fall back to offline page
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch (err) {
        const cache = await caches.open(STATIC_CACHE);
        const offline = await cache.match('./offline.html', { ignoreSearch: true });
        return offline || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // 3) Static assets → cache-first
  event.respondWith(cacheFirst(req));
});

// -------- STRATEGIES --------
async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    console.warn('[SW] Offline fallback (static) for', req.url);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    console.warn('[SW] Network error, no cache', req.url);
    return new Response('Network error', { status: 500 });
  }
}
