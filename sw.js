// 🟢 sw.js — start of full file
/* OkObserver Service Worker — Build 2025-11-12R1h12
   Absolute registration: SCRIPT=/okobserver/sw.js, SCOPE=/okobserver/
   Strategy: Network-first for HTML; cache-first for static.
*/
const SW_BUILD   = '2025-11-12R1h12';
const CACHE_NAME = 'okobserver-cache-' + SW_BUILD;

const ASSETS = [
  '/okobserver/', './',
  'index.html?v=2025-11-12H10',
  'override.css?v=2025-11-12H8',
  'main.js?v=2025-11-12R1h8',
  'PostDetail.js?v=2025-11-10R6',
  'logo.png',
  'favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => { if (k !== CACHE_NAME) return caches.delete(k); }));
    await self.clients.claim();
  })());
});

function isHTML(req){
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (isHTML(req)){
    event.respondWith((async()=>{
      try{
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      }catch(_){
        const cache = await caches.open(CACHE_NAME);
        const fallback = await cache.match(req, { ignoreSearch:true }) || await cache.match('index.html?v=2025-11-12H10');
        return fallback || new Response('<h1>Offline</h1>', { headers:{'Content-Type':'text/html'} });
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    const fresh = await fetch(req).catch(()=>null);
    if (fresh) { cache.put(req, fresh.clone()); return fresh; }
    return new Response('', { status: 504 });
  })());
});
// 🔴 sw.js — end of full file
