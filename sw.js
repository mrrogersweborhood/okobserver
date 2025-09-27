// sw.js — cache API JSON + images for instant repeat loads
const VERSION = "v7";
const API_CACHE = `api-${VERSION}`;
const IMG_CACHE = `img-${VERSION}`;

const API_PREFIX = "/api/wp/v2/";
const IMG_ALLOW_HOSTS = [
  "okobserver.org",
  "okobserver.files.wordpress.com",
  "i0.wp.com", "i1.wp.com", "i2.wp.com"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (![API_CACHE, IMG_CACHE].includes(k)) return caches.delete(k);
    }));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Cache API JSON from our own origin /api/wp/v2/*
  if (url.origin === location.origin && url.pathname.startsWith(API_PREFIX)) {
    event.respondWith(staleWhileRevalidate(event, request, API_CACHE));
    return;
  }

  // Cache images from allowed hosts
  if (request.destination === "image" && IMG_ALLOW_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, IMG_CACHE));
    return;
  }
});

async function staleWhileRevalidate(event, request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);

  if (cached) {
    if (event && typeof event.waitUntil === "function") event.waitUntil(networkFetch);
    return cached;
  }
  return (await networkFetch) || new Response("Offline", { status: 503 });
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request).catch(() => null);
  if (res && res.ok) cache.put(request, res.clone());
  return res || new Response("Offline image", { status: 503 });
}
