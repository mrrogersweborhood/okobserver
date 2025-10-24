// sw.js — OkObserver Service Worker (v2025-10-24b)
const CACHE_NAME = "okobserver-cache-v2025-10-24b";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./override.css?v=2025-10-24b",
  "./main.js?v=2025-10-24b",
  "./api.js?v=2025-10-24b",
  "./util.js?v=2025-10-24b",
  "./Home.js?v=2025-10-24b",
  "./PostDetail.js?v=2025-10-24b",
  "./About.js?v=2025-10-24b",
  "./Settings.js?v=2025-10-24b",
  "./logo.png",
  "./favicon.ico"
];

self.addEventListener("install", (event) => {
  console.log("[OkObserver SW] Installing:", CACHE_NAME);
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[OkObserver SW] Activating:", CACHE_NAME);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : undefined)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.url.includes("okobserver-proxy")) {
    event.respondWith(fetch(request).catch(() => new Response("")));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request)
          .then((netRes) => {
            if (netRes.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, netRes.clone()));
            }
            return netRes;
          })
          .catch(() => cached)
      );
    })
  );
});
