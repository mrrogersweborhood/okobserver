// /sw.js — OkObserver v0.2 (flat layout)
/* global self, caches, fetch */

const BUILD_VERSION = '0.2';
const STATIC_CACHE = `okobs-static-${BUILD_VERSION}`;
const RUNTIME_CACHE = `okobs-runtime-${BUILD_VERSION}`;

function scopeURL(relativePath) {
  return new URL(relativePath, self.registration.scope).toString();
}

// --- App shell asset list ---
// Adjusted to reflect flat GitHub Pages layout
const SHELL_ASSETS = [
  './',
  './index.html',
  './override.css?v=' + BUILD_VERSION,
  './main.js?v=' + BUILD_VERSION,
  './util.js?v=' + BUILD_VERSION,
  './api.js?v=' + BUILD_VERSION,
  './Home.js?v=' + BUILD_VERSION,
  './PostDetail.js?v=' + BUILD_VERSION,
  './About.js?v=' + BUILD_VERSION,
  './Settings.js?v=' + BUILD_VERSION,
  './logo.png'
];

const STATIC_ASSETS = SHELL_ASSETS.map(scopeURL);

// --- INSTALL ---
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_ASSETS);
    console.log('[OkObserver] Installed SW v' + BUILD_VERSION);
    self.skipWaiting();
  })());
});

// --- ACTIVATE ---
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(n => ![STATIC_CACHE, RUNTIME_CACHE].includes(n))
        .map(n => caches.delete(n))
    );
    await self.clients.claim();
    console.log('[OkObserver] Activated SW v' + BUILD_VERSION);
  })());
});

// --- MESSAGE HANDLER ---
self.addEventListener('message', (event) => {
  const data = event.data || {};
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
        console.log('[OkObserver] Runtime caches cleared');
      } catch (err) {
        port && port.postMessage({ ok: false, error: err?.message || String(err) });
      }
    })();
  }
});

// --- FETCH HANDLER ---
//  • WP API = network-first
//  • Everything else = cache-first
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isWPAPI =
    url.pathname.includes('/wp-json/wp/v2') ||
    url.pathname.includes('/wp-json/wp/') ||
    url.pathname.endsWith('/wp-json/');

  if (isWPAPI) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, res.clone());
        return res;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
  } else {
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
