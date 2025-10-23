// sw.js — OkObserver Service Worker (v2025-10-24a)

// ⬇️ BUMP THIS CACHE NAME
const CACHE_NAME = "okobserver-cache-v2025-10-24a";

// ⬇️ BUMP THESE URL VERSIONS TO MATCH YOUR HTML/JS IMPORTS
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./override.css?v=2025-10-24a",
  "./main.js?v=2025-10-24a",
  "./api.js?v=2025-10-24a",
  "./util.js?v=2025-10-24a",
  "./Home.js?v=2025-10-24a",
  "./PostDetail.js?v=2025-10-24a",
  "./About.js?v=2025-10-24a",
  "./Settings.js?v=2025-10-24a",
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

  // never cache proxy API calls
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
