/* 🟢 sw.js */
const SW_VERSION = '2025-11-03R1';
const SHELL_CACHE = `okobs-shell-${SW_VERSION}`;
const RUNTIME_CACHE = `okobs-runtime-${SW_VERSION}`;

const SHELL_ASSETS = [
  '/',               // GH Pages path root will map to index.html
  '/index.html',
  '/override.css?v=2025-11-03R1',
  '/main.js?v=2025-11-03R1',
  '/favicon.ico',
  '/logo.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try { await cache.addAll(SHELL_ASSETS); } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k !== SHELL_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
    }));
    self.clients.claim();
  })());
});

const isProxyApi = (url) =>
  url.hostname.includes('okobserver-proxy') &&
  url.pathname.includes('/wp-json/wp/v2/');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== 'GET') return;

  // Images: cache-first + revalidate
  if (req.destination === 'image') {
    e.respondWith(cacheFirstRevalidate(req));
    return;
  }

  // API: stale-while-revalidate (fast)
  if (isProxyApi(url)) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Shell/static: network-first with fallback to cache
  if (req.destination === 'document' || req.destination === 'script' || req.destination === 'style') {
    e.respondWith(networkFirst(req));
    return;
  }
});

async function cacheFirstRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then(resp => {
    cache.put(request, resp.clone()).catch(()=>{});
    return resp;
  }).catch(() => cached);
  return cached || networkPromise;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then(resp => {
    cache.put(request, resp.clone()).catch(()=>{});
    return resp;
  }).catch(() => cached);
  return cached || networkPromise;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const resp = await fetch(request);
    cache.put(request, resp.clone()).catch(()=>{});
    return resp;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}
/* 🔴 sw.js */
