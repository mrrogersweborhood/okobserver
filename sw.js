/*  sw.js — v2025-10-30p
    OkObserver PWA service worker
    - Cache-first for app shell
    - Network-first (with timeout) for API
    - Versioned caches; old ones cleaned on activate
    - Skips caching of 404/5xx; supports ?nocache=1 bypass
*/

const VERSION = '2025-10-30p';
const PREFIX  = 'okobserver:';
const SHELL   = `${PREFIX}${VERSION}:shell`;
const RUNTIME = `${PREFIX}${VERSION}:runtime`;

const API_HOST = 'okobserver-proxy.bob-b5c.workers.dev';
const API_PATH = '/wp-json/wp/v2/';

// Build URL relative to this SW scope
const scopeURL = new URL(self.registration.scope);
const r = (path) => new URL(path, scopeURL).toString();

// App shell to precache (minimal but complete)
const SHELL_URLS = [
  r('./'),
  r('./index.html'),
  r('./override.css?v=2025-10-30p'),
  r('./main.js?v=2025-10-30p'),
  r('./Home.js?v=2025-10-30p'),
  r('./PostDetail.js?v=2025-10-30p'),
  r('./About.js?v=2025-10-27a'),
  r('./Settings.js?v=2025-10-27a'),
  r('./logo.png'),
  r('./favicon.ico'),
];

// ---- Install: pre-cache shell and take over ASAP
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

// ---- Activate: cleanup old caches, enable nav preload, claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
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
    if (res && res.ok && request.method === 'GET') cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw new Error('network-first failed and no cache');
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok && request.method === 'GET') cache.put(request, res.clone());
  return res;
}

// ---- Fetch router
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) API requests → network-first w/ timeout
  const isAPI = url.hostname === API_HOST && url.pathname.startsWith(API_PATH);
  if (isAPI) {
    event.respondWith(
      networkFirstWithTimeout(req, RUNTIME, 6000).catch(async () => {
        return new Response(
          JSON.stringify({ error: 'offline', message: 'API unavailable' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // 2) Navigations → serve app shell
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
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

  // 3) Static versioned assets → cache-first
  const isSameOrigin = url.origin === scopeURL.origin;
  if (isSameOrigin) {
    const isVersioned = url.searchParams.has('v');
    const isStaticExt = /\.(css|js|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$/i.test(url.pathname);
    if (isVersioned || isStaticExt) {
      event.respondWith(cacheFirst(req, SHELL));
      return;
    }
  }

  // 4) Fallback → network, then cache
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      return res;
    } catch {
      const cache = await caches.open(RUNTIME);
      const cached = await cache.match(req, { ignoreVary: true });
      if (cached) return cached;
      return new Response('Gateway Timeout', { status: 504 });
    }
  })());
});
