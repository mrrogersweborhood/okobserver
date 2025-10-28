// sw.js — v2025-10-27f
// Fix: prevent blank page caching by skipping cache on first navigation.
// Adds smarter shell revalidation + safer stale-while-revalidate.

const VER = '2025-10-27f';
const CACHE = `okobserver-cache-v${VER}`;
const CACHE_PREFIX = 'okobserver-cache-v';

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
  './api.js?v=2025-10-27d',
  './logo.png',
  './favicon.ico'
];

function isPostList(url) {
  return url.pathname.endsWith('/wp-json/wp/v2/posts');
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(STATIC);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    const keys = await caches.keys();
    await Promise.all(keys.map(k =>
      (k.startsWith(CACHE_PREFIX) && k !== CACHE) ? caches.delete(k) : null
    ));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isJSON = url.pathname.includes('/wp-json/') || url.pathname.endsWith('.json');

  // HTML navigations: network-first (never cache blank shell)
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        // cache only if HTML body contains app shell marker
        if (net.ok) {
          const clone = net.clone();
          const text = await clone.text();
          if (text.includes('<main id="app"')) {
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

  // Posts list: stale-while-revalidate
  if (isJSON && isPostList(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const revalidate = (async () => {
        try {
          const net = await fetch(req, { cache: 'no-store' });
          if (net && net.ok) await cache.put(req, net.clone());
        } catch {}
      })();
      if (cached) {
        e.waitUntil(revalidate);
        return cached;
      }
      try {
        const net = await fetch(req, { cache: 'no-store' });
        if (net.ok) await cache.put(req, net.clone());
        return net;
      } catch {
        return new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Other JSON: network-first
  if (isJSON) {
    e.respondWith((async () => {
      try {
        const net = await fetch(req, { cache: 'no-store' });
        if (net.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(req, net.clone());
        }
        return net;
      } catch {
        return await caches.match(req) || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Static assets: cache-first
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const net = await fetch(req);
      if (net.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, net.clone());
      }
      return net;
    } catch {
      return await caches.match('./index.html') || new Response('Offline', { status: 503 });
    }
  })());
});
