// sw.js — v2025-10-28c
// Safe, fast strategies + _t-normalization for JSON caching.
//
// Strategies:
// - Navigations (HTML): network-first, cache good shell only
// - Posts list JSON: stale-while-revalidate (fast repeat loads)
// - Other JSON: network-first (with cache fallback)
// - Static assets: cache-first
//
// Special: strip the `_t` query param that api.js adds so we don't bloat cache.

const VER = '2025-10-28c';
const CACHE = `okobserver-cache-v${VER}`;
const CACHE_PREFIX = 'okobserver-cache-v';

// Keep these in sync with your deployed versions
const STATIC = [
  './',
  './index.html',
  './override.css?v=2025-10-27i',
  './main.js?v=2025-10-28a',
  './Home.js?v=2025-10-28a',
  './PostDetail.js?v=2025-10-27f',
  './About.js?v=2025-10-27a',
  './Settings.js?v=2025-10-27a',
  './util.js?v=2025-10-24e',
  './api.js?v=2025-10-28b',
  './logo.png',
  './favicon.ico',
];

// ---------- helpers ----------
function isJSON(url) {
  return url.pathname.includes('/wp-json/') || url.pathname.endsWith('.json');
}
function isPostsList(url) {
  // /wp-json/wp/v2/posts
  return url.pathname.endsWith('/wp-json/wp/v2/posts');
}
// Remove cache-busting _t param so we reuse a single cache entry
function normalizedRequest(req) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.has('_t')) {
      url.searchParams.delete('_t');
      // Keep method/headers/body for GET only (we only handle GETs here)
      return new Request(url.toString(), {
        method: req.method,
        headers: req.headers,
        mode: req.mode,
        credentials: req.credentials,
        cache: 'no-store',
        redirect: req.redirect,
        referrer: req.referrer,
        referrerPolicy: req.referrerPolicy,
        integrity: req.integrity,
      });
    }
  } catch {}
  return req;
}

// ---------- lifecycle ----------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(STATIC);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Enable navigation preload
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    // Clear old versions
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k.startsWith(CACHE_PREFIX) && k !== CACHE) ? caches.delete(k) : null)
    );
    await self.clients.claim();
  })());
});

// ---------- fetch ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) HTML navigations — network-first to avoid caching a blank shell
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // Prefer preloaded response if available
        const pre = await event.preloadResponse;
        if (pre) return pre;

        const net = await fetch(req, { cache: 'no-store' });
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

  // 2) Posts list JSON — Stale-While-Revalidate
  if (json && isPostsList(normURL)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(normReq);

      const revalidate = (async () => {
        try {
          const net = await fetch(req, { cache: 'no-store' }); // fetch original (may have _t)
          if (net && net.ok) await cache.put(normReq, net.clone());
        } catch {}
      })();

      if (cached) {
        event.waitUntil(revalidate);
        return cached;
      }
      try {
        const net = await fetch(req, { cache: 'no-store' });
        if (net && net.ok) {
          await cache.put(normReq, net.clone());
        }
        return net;
      } catch {
        return new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // 3) Other JSON — network-first with cache fallback
  if (json) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req, { cache: 'no-store' });
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

  // 4) Static assets — cache-first
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
      // last resort
      const shell = await caches.match('./index.html');
      return shell || new Response('Offline', { status: 503 });
    }
  })());
});
