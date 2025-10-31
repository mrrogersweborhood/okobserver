/* sw.js — v2025-10-31c (resilient install)
   OkObserver Progressive Web App Service Worker
   ------------------------------------------------------------
   - Cache-first app shell (+ offline.html)
   - Network-first for WordPress API JSON
   - Navigation fallback to offline page
   - Immediate activation (skipWaiting + claim)
   - Safe install: never fails on missing file
*/

const CACHE_VERSION = '2025-10-31c';
const STATIC_CACHE = `okobserver-static-${CACHE_VERSION}`;
const DATA_CACHE   = `okobserver-data-${CACHE_VERSION}`;

// ✅ Keep these filenames/version params exactly as they exist in GitHub
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

// ------------------------------------------------------------
// INSTALL
// ------------------------------------------------------------
self.addEventListener('install', (event) => {
  console.log('[SW] Installing', CACHE_VERSION);
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await addAllSafe(cache, APP_SHELL);
    await self.skipWaiting();
  })());
});

// Helper: add files to cache safely, skipping 404s
async function addAllSafe(cache, urls) {
  for (const url of urls) {
    try {
      const req = new Request(url, { cache: 'no-cache' });
      const res = await fetch(req);
      if (res.ok) {
        await cache.put(req, res.clone());
      } else {
        console.warn('[SW] Skipped (non-OK)', url, res.status);
      }
    } catch (e) {
      console.warn('[SW] Skipped (fetch fail)', url, e?.message || e);
    }
  }
}

// ------------------------------------------------------------
// ACTIVATE
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// FETCH
// ------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  // --- API (network first)
  if (url.href.startsWith(API_BASE)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // --- Navigation requests
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        const offline = await cache.match('./offline.html', { ignoreSearch: true });
        if (offline) {
          console.log('[SW] Serving offline.html (no network)');
          return offline;
        }
        return new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // --- Static assets (cache first)
  event.respondWith(cacheFirst(req));
});

// ------------------------------------------------------------
// STRATEGIES
// ------------------------------------------------------------
async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response('Network error', { status: 500 });
  }
}
