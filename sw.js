/* OkObserver Service Worker — v2025-10-31d
   Goals:
   - Instant activation (skipWaiting + clients.claim)
   - Offline fallback for navigations (offline.html)
   - Cache-first for app shell (CSS/JS/icons)
   - Network-first for API (wp-json via Cloudflare Worker / okobserver.org)
   - No caching of error/opaque failures
   - Gentle revalidation in background
*/

const CACHE_VERSION = '2025-10-31d';
const APP_CACHE  = `oko-app-${CACHE_VERSION}`;
const DATA_CACHE = `oko-data-${CACHE_VERSION}`;
const ORIGIN = self.location.origin; // e.g., https://mrrogersweborhood.github.io
const SCOPE_PATH = self.registration.scope.replace(ORIGIN, '').replace(/\/+$/, ''); // e.g., /okobserver
const BASE = SCOPE_PATH || '';

/* -------- App Shell (adjust versions if you bump filenames) -------- */
const SHELL_URLS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/offline.html`,
  `${BASE}/override.css?v=2025-10-31d`,
  `${BASE}/main.js?v=2025-10-31c`,
  `${BASE}/Home.js?v=2025-10-27b`,
  `${BASE}/PostDetail.js?v=2025-10-31c`,
  `${BASE}/manifest.json?v=2025-10-31a`,
  `${BASE}/logo.png`,
  `${BASE}/icon-192.png`,
  `${BASE}/icon-512.png`,
  `${BASE}/favicon.ico`,
];

/* -------- Utilities -------- */
const isAPI = (url) => {
  const u = new URL(url, ORIGIN);
  return /\/wp-json\/|\/wp\/v2\/|\/wp-json\/wp\/v2\//.test(u.pathname) ||
         u.hostname.endsWith('.workers.dev') && /\/wp-json\//.test(u.pathname);
};

const isSameOriginAsset = (req) => {
  try {
    const u = new URL(req.url);
    return u.origin === ORIGIN && (
      /\.(?:css|js|png|jpg|jpeg|gif|svg|ico|webp|json|html)$/i.test(u.pathname) ||
      u.pathname === `${BASE}/` || u.pathname === `${BASE}/index.html`
    );
  } catch { return false; }
};

const okToCache = (res) => res && res.ok && (res.type === 'basic' || res.type === 'cors');

/* -------- Install -------- */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);

    // Add shell items individually so a missing file doesn't fail the whole install
    const results = await Promise.allSettled(
      SHELL_URLS.map((u) => cache.add(u).catch(() => null))
    );
    const added = results.filter(r => r.status === 'fulfilled').length;
    console.log(`[SW] Installed ${APP_CACHE}. Shell entries cached: ${added}/${SHELL_URLS.length}`);
  })());
});

/* -------- Activate -------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Enable Navigation Preload for faster first paint (if supported)
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }

    // Clean old caches
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => ![APP_CACHE, DATA_CACHE].includes(k) && /^(oko-app-|oko-data-)/.test(k))
        .map(k => caches.delete(k))
    );

    await self.clients.claim();
    console.log('[SW] Activated', { APP_CACHE, DATA_CACHE });
  })());
});

/* -------- Message: allow manual SKIP_WAITING -------- */
self.addEventListener('message', (event) => {
  const { type } = event.data || {};
  if (type === 'SKIP_WAITING' && self.skipWaiting) {
    self.skipWaiting();
  }
});

/* -------- Fetch Strategy -------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1) Navigations → Network-first, fallback to offline.html
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // Use preload response if available (faster)
        const preload = await event.preloadResponse;
        if (preload) return preload;

        const net = await fetch(request);
        // Cache the index shell quietly (optional)
        if (okToCache(net)) {
          const cache = await caches.open(APP_CACHE);
          cache.put(`${BASE}/index.html`, net.clone());
        }
        return net;
      } catch (err) {
        const cache = await caches.open(APP_CACHE);
        const offline = await cache.match(`${BASE}/offline.html`);
        return offline || new Response('<h1>Offline</h1>', { status: 503, headers: { 'content-type': 'text/html' } });
      }
    })());
    return;
  }

  // 2) API (network-first, fallback to cache)
  if (isAPI(request.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      try {
        const net = await fetch(request, { cache: 'no-store' });
        if (okToCache(net)) {
          cache.put(request, net.clone());
        }
        return net;
      } catch (err) {
        const hit = await cache.match(request);
        if (hit) return hit;
        return new Response(JSON.stringify({ error: 'offline', detail: 'API unavailable' }), {
          status: 503,
          headers: { 'content-type': 'application/json' }
        });
      }
    })());
    return;
  }

  // 3) Same-origin static assets → Cache-first, then network; revalidate in background
  if (isSameOriginAsset(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        // Revalidate in background
        event.waitUntil((async () => {
          try {
            const fresh = await fetch(request, { cache: 'no-store' });
            if (okToCache(fresh)) await cache.put(request, fresh.clone());
          } catch {}
        })());
        return cached;
      }
      try {
        const net = await fetch(request);
        if (okToCache(net)) await cache.put(request, net.clone());
        return net;
      } catch (err) {
        // If offline and we asked for the app shell, return cached offline shell
        const offline = await cache.match(`${BASE}/offline.html`);
        return offline || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // 4) Everything else → network passthrough
  event.respondWith(fetch(request));
});
