// sw.js — v2025-10-28d
// Remove cache hints that inject Cache-Control on requests (CORS-safe).
// Keep fast strategies, normalize _t to avoid cache bloat.

const VER = '2025-10-28d';
const CACHE = `okobserver-cache-v${VER}`;
const CACHE_PREFIX = 'okobserver-cache-v';

const STATIC = [
  './',
  './index.html',
  './override.css?v=2025-10-27i',
  './main.js?v=2025-10-28a',     // keep in sync with your file
  './Home.js?v=2025-10-28a',
  './PostDetail.js?v=2025-10-27f',
  './About.js?v=2025-10-27a',
  './Settings.js?v=2025-10-27a',
  './util.js?v=2025-10-24e',
  './api.js?v=2025-10-28c',
  './logo.png',
  './favicon.ico',
];

function isJSON(url) {
  return url.pathname.includes('/wp-json/') || url.pathname.endsWith('.json');
}
function isPostsList(url) {
  return url.pathname.endsWith('/wp-json/wp/v2/posts');
}
function normalizedRequest(req) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.has('_t')) {
      url.searchParams.delete('_t');
      return new Request(url.toString(), {
        method: req.method,
        headers: req.headers,
        mode: req.mode,
        credentials: req.credentials,
        redirect: req.redirect,
        referrer: req.referrer,
        referrerPolicy: req.referrerPolicy,
        integrity: req.integrity,
      });
    }
  } catch {}
  return req;
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
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k.startsWith(CACHE_PREFIX) && k !== CACHE) ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // HTML navigations: network-first (no cache hints)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const pre = await event.preloadResponse;
        if (pre) return pre;

        const net = await fetch(req);
        if (net && net.ok) {
          const text = await net.clone().text();
          if (text.includes('<main id="app"')) {
            const cache = await caches.open(CACHE);
            cache.put('./index.html', new Response(text, { headers: { 'Content-Type': 'text/html' } }));
          }
          return new Response(text, { headers: { 'Content-Type': 'text/html' } });
        }
      } catch {}
      const cached = await caches.match('./index.html');
      return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
    })());
    return;
  }

  const normReq = normalizedRequest(req);
  const normURL = new URL(normReq.url);
  const json = isJSON(normURL);

  // Posts list: stale-while-revalidate (no cache hints)
  if (json && isPostsList(normURL)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(normReq);

      const revalidate = (async () => {
        try {
          const net = await fetch(req); // original request (may include _t)
          if (net && net.ok) await cache.put(normReq, net.clone());
        } catch {}
      })();

      if (cached) {
        event.waitUntil(revalidate);
        return cached;
      }
      try {
        const net = await fetch(req);
        if (net && net.ok) await cache.put(normReq, net.clone());
        return net;
      } catch {
        return new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Other JSON: network-first with cache fallback (no cache hints)
  if (json) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        if (net && net.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(normReq, net.clone());
        }
        return net;
      } catch {
        const cached = await caches.match(normReq);
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Static assets: cache-first
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const net = await fetch(req);
      if (net && net.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(req, net.clone());
      }
      return net;
    } catch {
      const shell = await caches.match('./index.html');
      return shell || new Response('Offline', { status: 503 });
    }
  })());
});
