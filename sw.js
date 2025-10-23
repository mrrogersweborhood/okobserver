// sw.js — OkObserver Service Worker (v2025-10-23b)

const CACHE_NAME = "okobserver-cache-v2025-10-23b";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./override.css?v=2025-10-23b",
  "./main.js?v=2025-10-23b",
  "./api.js?v=2025-10-23b",
  "./util.js?v=2025-10-23b",
  "./Home.js?v=2025-10-23b",
  "./PostDetail.js?v=2025-10-23b",
  "./About.js?v=2025-10-23b",
  "./Settings.js?v=2025-10-23b",
  "./logo.png",
  "./favicon.ico"
];

// Install event: cache all static assets
self.addEventListener("install", (event) => {
  console.log("[OkObserver SW] Installing version:", CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event: remove old caches
self.addEventListener("activate", (event) => {
  console.log("[OkObserver SW] Activating new version:", CACHE_NAME);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[OkObserver SW] Removing old cache:", key);
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch handler: serve from cache first, then network
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Skip proxy API requests — always go to network
  if (request.url.includes("okobserver-proxy")) {
    event.respondWith(fetch(request).catch(() => new Response("")));
    return;
  }

  // Otherwise, use cache-first strategy
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse.clone());
              });
            }
            return networkResponse;
          })
          .catch(() => cached)
      );
    })
  );
});
