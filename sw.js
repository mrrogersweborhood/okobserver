/* OkObserver Service Worker — 2025-11-07SR1-perfSWR1-hotfix3s */
const SW_VER = '2025-11-07SR1-perfSWR1-hotfix3s';
const CACHE_NAME = 'okobs-' + SW_VER;
const APP_SHELL = [
  './',
  './index.html',
  './main.js?v=2025-11-07SR1-perfSWR1-videoR1',
  './override.css?v=2025-11-06SR1-gridLock1-hotfix3n-videoR1',
  './offline.html'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)).catch(()=>{}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Only GET
  if (req.method !== 'GET') return;

  // Network-first for API, cache-first for same-origin shell
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isAPI = /\/wp-json\/wp\/v2\//.test(url.href) || /okobserver-proxy\.bob-b5c\.workers\.dev/.test(url.href);

  if (isAPI) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((m) => m || caches.match('./offline.html')))
    );
    return;
  }

  if (isSameOrigin) {
    e.respondWith(
      caches.match(req).then((m) => m || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match('./offline.html')))
    );
  }
});
