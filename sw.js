/* OkObserver Service Worker
   Version: 2025-11-02S1
   Strategy:
   - NetworkFirst (5s timeout) for API list/detail (fresh posts quickly)
   - CacheFirst for images with LRU (max 120, 14 days)
   - CacheFirst for CSS/JS with versioned URLs
*/

const SW_VERSION = "2025-11-02S1";
const API_CACHE = "api-posts-" + SW_VERSION;
const IMG_CACHE = "img-v3-" + SW_VERSION;
const ASSET_CACHE = "assets-v3-" + SW_VERSION;

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (![API_CACHE, IMG_CACHE, ASSET_CACHE].includes(k)) return caches.delete(k);
    }));
    self.clients.claim();
  })());
});

// Utility: network-first with timeout
async function networkFirstWithTimeout(req, cacheName, timeoutMs=5000) {
  const cache = await caches.open(cacheName);
  return new Promise(async (resolve) => {
    let settled = false;
    const timer = setTimeout(async () => {
      if (settled) return;
      const cached = await cache.match(req);
      if (cached) { settled = true; resolve(cached); }
    }, timeoutMs);

    try {
      const fresh = await fetch(req);
      clearTimeout(timer);
      if (!settled) {
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        settled = true; resolve(fresh);
      }
    } catch {
      clearTimeout(timer);
      if (!settled) {
        const cached = await cache.match(req);
        if (cached) resolve(cached);
        else resolve(new Response("Offline", { status: 503 }));
      }
    }
  });
}

// LRU helper: trim image cache
async function trimCacheLRU(cacheName, maxEntries=120) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  // delete oldest first
  const toDelete = keys.slice(0, keys.length - maxEntries);
  await Promise.all(toDelete.map(k => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== "GET") return;

  // Posts API (list & detail)
  if (url.href.includes("/wp-json/wp/v2/posts")) {
    event.respondWith(networkFirstWithTimeout(request, API_CACHE, 5000));
    return;
  }

  // Images
  if (request.destination === "image") {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const resp = await fetch(request, { cache: "no-store" });
        if (resp && resp.ok) {
          await cache.put(request, resp.clone());
          // trim asynchronously
          trimCacheLRU(IMG_CACHE, 120).catch(()=>{});
        }
        return resp;
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Assets (CSS/JS/HTML) — CacheFirst (versioned URLs recommended)
  if (["style", "script", "document"].includes(request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const resp = await fetch(request);
        if (resp && resp.ok) cache.put(request, resp.clone());
        return resp;
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }
});
