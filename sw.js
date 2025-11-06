/* 🟢 sw.js — OkObserver Service Worker
   Build 2025-11-06SR1-perfSWR1
   Strategy:
     - Stale-While-Revalidate (SWR) for: app shell (HTML), main.js, override.css, images, and WP API.
     - Keeps UI instant from cache while quietly refreshing.
   Plain JS (no ESM).
*/

const CACHE_APP    = 'okob-appshell-2025-11-06SR1-perfSWR1';
const CACHE_ASSETS = 'okob-assets-2025-11-06SR1-perfSWR1';
const CACHE_API    = 'okob-api-2025-11-06SR1-perfSWR1';
const CACHE_IMG    = 'okob-img-2025-11-06SR1-perfSWR1';

const APP_SHELL = [
  './',
  './index.html',
  './index.html?v=2025-11-06SR1-perfSWR1'
];

const ASSETS = [
  './main.js',
  './override.css',
  './main.js?v=2025-11-06SR1-perfSWR1',
  './override.css?v=2025-11-06SR1-perfSWR1',
  './favicon.ico'
];

// -------- helpers --------
async function swr(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then(res => {
    cache.put(req, res.clone()).catch(()=>{});
    return res;
  }).catch(()=>null);
  return cached || network || (await network);
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  cache.put(req, res.clone()).catch(()=>{});
  return res;
}

// -------- lifecycle --------
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const app = await caches.open(CACHE_APP);
    await app.addAll(APP_SHELL);
    const assets = await caches.open(CACHE_ASSETS);
    await assets.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = new Set([CACHE_APP, CACHE_ASSETS, CACHE_API, CACHE_IMG]);
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// -------- fetch --------
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  const url = new URL(req.url);

  // 1) App shell HTML (SWR)
  if (url.origin === location.origin && (url.pathname === '/' || url.pathname.endsWith('/index.html'))) {
    e.respondWith(swr(req, CACHE_APP));
    return;
  }

  // 2) Assets (SWR)
  if (url.origin === location.origin && (url.pathname.endsWith('/main.js') || url.pathname.endsWith('/override.css') || url.pathname.endsWith('/favicon.ico'))) {
    e.respondWith(swr(req, CACHE_ASSETS));
    return;
  }

  // 3) Images (SWR)
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname)) {
    e.respondWith(swr(req, CACHE_IMG));
    return;
  }

  // 4) WP API (SWR so UI is instant but refreshes)
  if (url.hostname.includes('workers.dev') && url.pathname.includes('/wp-json/wp/v2/')) {
    e.respondWith(swr(req, CACHE_API));
    return;
  }

  // 5) Fallback — cache-first
  e.respondWith(cacheFirst(req, CACHE_ASSETS));
});

// Allow page to request immediate activation
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* 🔴 sw.js — OkObserver Service Worker */
