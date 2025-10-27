// sw.js — v2025-10-27e
// Perf-focused SW:
// - Uses Navigation Preload properly for HTML navigations
// - Stale-While-Revalidate for the posts list endpoint (fast feels on repeat/page loads)
// - Network-first for other JSON/data
// - Cache-first for static shell
// - Cleans old caches by prefix

const VER = '2025-10-27e';
const CACHE = `okobserver-cache-v${VER}`;
const CACHE_PREFIX = 'okobserver-cache-v';

// --- Static app shell (versions matched to your current deploy) ---
const STATIC = [
  './',
  './index.html',
  './override.css?v=2025-10-27i',
  './main.js?v=2025-10-27d',
  './Home.js?v=2025-10-27d',
  './PostDetail.js?v=2025-10-27f',
  './About.js?v=2025-10-27a',
  './Settings.js?v=2025-10-27a',
  './util.js?v=2025-10-24e',
  './api.js?v=2025-10-27a',
  './logo.png',
  './favicon.ico'
];

// Helper: detect the WP posts list endpoint (used by Home/infinite scroll)
function isPostsList(url) {
  // e.g. https://…/wp-json/wp/v2/posts?per_page=24&page=2&_embed=1&_fields=…
  return url.pathname.endsWith('/wp-json/wp/v2/posts');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(STATIC);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Enable navigation preload (faster first paint on cold start)
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    // Remove old versions
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k.startsWith(CACHE_PREFIX) && k !== CACHE) ? caches.delete(k) : undefined));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isJSON = url.pathname.includes('/wp-json/') || url.pathname.endsWith('.json');

  // 1) HTML navigations: use preload → network → cached shell
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
      } catch {}
      try {
        const net = await fetch(req);
        // keep a hot copy of index.html
        const cache = await caches.open(CACHE);
        cache.put('./index.html', net.clone());
        return net;
      } catch {
        const shell = await caches.match('./index.html');
        return shell || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 2) Posts list (Home / infinite scroll): Stale-While-Revalidate
  if (isJSON && isPostsList(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      // start revalidate in background
      const revalidate = (async () => {
        try {
          const net = await fetch(req, { cache: 'no-store' });
          // only store successful responses
          if (net && net.ok) await cache.put(req, net.clone());
        } catch {}
      })();

      if (cached) {
        // return cached immediately, and revalidate silently
        event.waitUntil(revalidate);
        return cached;
      }
      // no cached → go to network
      try {
        const net = await fetch(req, { cache: 'no-store' });
        if (net && net.ok) await cache.put(req, net.clone());
        return net;
      } catch {
        // last resort: nothing to show
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 3) Other JSON/data: network-first with cache fallback
  if (isJSON) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        if (net && net.ok) await cache.put(req, net.clone());
        return net;
      } catch {
        const cached = await caches.match(req);
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 4) Static assets: cache-first
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const net = await fetch(req);
      const cache = await caches.open(CACHE);
      if (net && net.ok) await cache.put(req, net.clone());
      return net;
    } catch {
      const shell = await caches.match('./index.html');
      return shell || new Response('Offline', { status: 503 });
    }
  })());
});
