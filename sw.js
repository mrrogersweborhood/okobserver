// /sw.js
/* global self, caches, fetch */

const BUILD_VERSION = '0.1';                 // bump on deploy
const STATIC_CACHE = `okobs-static-${BUILD_VERSION}`;
const RUNTIME_CACHE = `okobs-runtime-${BUILD_VERSION}`;

/**
 * Use RELATIVE paths for GH Pages subfolder hosting.
 */
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles/override.css?v=' + BUILD_VERSION,
  './src/main.js?v=' + BUILD_VERSION,
  './src/lib/util.js?v=' + BUILD_VERSION,
  './src/lib/api.js?v=' + BUILD_VERSION,
  './src/views/Home.js?v=' + BUILD_VERSION,
  './src/views/PostDetail.js?v=' + BUILD_VERSION,
  './src/views/About.js?v=' + BUILD_VERSION,
  './src/views/Settings.js?v=' + BUILD_VERSION
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
    await Promise.all(
      names
        .filter(n => ![STATIC_CACHE, RUNTIME_CACHE].includes(n))
        .map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  // Response channel if provided (for request/response style messaging)
  const port = event.ports && event.ports[0];

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    port && port.postMessage({ ok: true });
    return;
  }

  if (data.type === 'CLEAR_RUNTIME_CACHES') {
    (async () => {
      try {
        const names = await caches.keys();
        const toDelete = names.filter(n => n.startsWith('okobs-runtime-'));
        await Promise.all(toDelete.map(n => caches.delete(n)));
        port && port.postMessage({ ok: true });
      } catch (err) {
        port && port.postMessage({ ok: false, error: err?.message || String(err) });
      }
    })();
    return;
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

  const isWPAPI =
    url.pathname.includes('/wp-json/wp/v2') ||
    url.pathname.includes('/wp-json/wp/') ||
    url.pathname.endsWith('/wp-json/');

  if (isWPAPI) {
    // Network-first for JSON/API
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, res.clone());
        return res;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' }});
      }
    })());
  } else {
    // Cache-first for static assets
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, res.clone());
        return res;
      } catch (err) {
        throw err;
      }
    })());
  }
});
