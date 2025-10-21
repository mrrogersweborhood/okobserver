// /sw.js
/* global self, caches, fetch */

const BUILD_VERSION = '0.1';                 // ⬅ bump on deploy
const STATIC_CACHE = `okobs-static-${BUILD_VERSION}`;
const RUNTIME_CACHE = `okobs-runtime-${BUILD_VERSION}`;

/**
 * Compute a base-relative URL for pre-caching that works no matter where we’re hosted.
 * - self.registration.scope is the absolute URL to the SW scope (e.g., https://domain.tld/okobserver/)
 * - We join relative asset paths to that scope so they cache under the correct subpath.
 */
function scopeURL(relativePath) {
  return new URL(relativePath, self.registration.scope).toString();
}

/**
 * List your app-shell assets here as RELATIVE paths (no leading slash).
 * We’ll resolve them against the SW scope at install time.
 */
const SHELL_ASSETS = [
  './',                         // index route
  './index.html',
  './styles/override.css?v=' + BUILD_VERSION,
  './src/main.js?v=' + BUILD_VERSION,
  './src/lib/util.js?v=' + BUILD_VERSION,
  './src/lib/api.js?v=' + BUILD_VERSION,
  './src/views/Home.js?v=' + BUILD_VERSION,
  './src/views/PostDetail.js?v=' + BUILD_VERSION,
  './src/views/About.js?v=' + BUILD_VERSION,
  './src/views/Settings.js?v=' + BUILD_VERSION,
  './logo.png'
];

// Resolve the shell list against our scope (done once at module init)
const STATIC_ASSETS = SHELL_ASSETS.map(scopeURL);

// --- INSTALL: pre-cache app shell ---
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_ASSETS);
    self.skipWaiting();
  })());
});

// --- ACTIVATE: clean up old caches, take control ---
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

// --- MESSAGES: helper commands (skip waiting, clear runtime caches) ---
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
      } catch (err) {
        port && port.postMessage({ ok: false, error: err?.message || String(err) });
      }
    })();
  }
});

// --- FETCH: network strategies ---
//  - WordPress API: network-first with runtime cache fallback
//  - Everything else: cache-first with runtime fill
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
        return new Response(
          JSON.stringify({ error: 'offline' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
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
        // If both cache and network fail, just rethrow
        throw err;
      }
    })());
  }
});
