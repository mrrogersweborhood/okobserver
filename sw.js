/*  sw.js — v2025-10-28j
    OkObserver PWA service worker
    - Cache-first for app shell
    - Network-first (with timeout) for API
    - Versioned caches; old ones cleaned on activate
*/

const VERSION = '2025-10-28j';
const PREFIX  = 'okobserver:';
const SHELL   = `${PREFIX}${VERSION}:shell`;
const RUNTIME = `${PREFIX}${VERSION}:runtime`;

const API_HOST = 'okobserver-proxy.bob-b5c.workers.dev';
const API_PATH = '/wp-json/wp/v2/';

// Build URL relative to this SW scope (so it works under /okobserver/)
const scopeURL = new URL(self.registration.scope);
const r = (path) => new URL(path, scopeURL).toString();

// App shell to precache (minimal but complete)
const SHELL_URLS = [
  r('./'),
  r('./index.html'),
  r('./override.css?v=2025-10-27i'),
  r('./main.js?v=2025-10-28j'),
  r('./Home.js?v=2025-10-28f'),
  r('./PostDetail.js?v=2025-10-28n'),
  r('./About.js?v=2025-10-27a'),
  r('./Settings.js?v=2025-10-27a'),
  r('./logo.png'),
  r('./favicon.ico'),
];

// ---- Install: pre-cache the shell and take over ASAP
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// ---- Activate: cleanup old caches, enable nav preload, claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Navigation preload helps the first navigation while the SW starts
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }

    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(PREFIX) && !k.includes(VERSION))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ---- Helpers
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

async function networkFirstWithTimeout(request, cacheName, ms = 6000) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([fetch(request), timeout(ms)]);
    if (res && res.ok && request.method === 'GET') {
      // Clone before put (response streams are one-use)
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    // If nothing cached and network failed, rethrow so caller can decide
    throw new Error('network-first failed and no cache');
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok && request.method === 'GET') {
    cache.put(request, res.clone());
  }
  return res;
}

// ---- Fetch strategy router
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) API requests → network-first with timeout (cache as fallback)
  const isAPI =
    url.hostname === API_HOST &&
    url.pathname.startsWith(API_PATH);

  if (isAPI) {
    event.respondWith(
      networkFirstWithTimeout(req, RUNTIME, 6000).catch(async () => {
        // As a very last resort, return a tiny JSON error (so UI can show a message)
        return new Response(
          JSON.stringify({ error: 'offline', message: 'API unavailable' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // 2) Navigations → serve app shell (index.html) from cache
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // If navigation preload is available, prefer it
        const preload = await event.preloadResponse;
        if (preload) return preload;
      } catch {}
      const cache = await caches.open(SHELL);
      const cached = await cache.match(r('./index.html'));
      if (cached) return cached;
      return fetch(req);
    })());
    return;
  }

  // 3) Same-origin static assets with versioned URLs → cache-first
  const isSameOrigin = url.origin === scopeURL.origin;
  if (isSameOrigin) {
    // Heuristic: treat files that carry a ?v= token or end with a known static extension as shell assets.
    const isVersioned = url.searchParams.has('v');
    const isStaticExt = /\.(css|js|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$/i.test(url.pathname);
    if (isVersioned || isStaticExt) {
      event.respondWith(cacheFirst(req, SHELL));
      return;
    }
  }

  // 4) Everything else → try network, fallback to cache if present
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      return res;
    } catch {
      const cache = await caches.open(RUNTIME);
      const cached = await cache.match(req, { ignoreVary: true });
      if (cached) return cached;
      // default fallback: empty 504
      return new Response('Gateway Timeout', { status: 504 });
    }
  })());
});
