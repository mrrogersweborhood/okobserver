/* OkObserver sw.js — v=2025-11-06SR1-perfSWR1-hotfix3
   Hardening:
   - cache version short-circuit on mismatch
   - gentle offline fallback (optional offline.html)
   - keeps existing cache-then-network strategy for core + posts
*/

const VER = "2025-11-06SR1-perfSWR1-hotfix3";
const CACHE_NAME = "oko-cache-" + VER;
const CORE = [
  "./",
  "index.html?v="+VER,
  "main.js?v="+VER,
  "override.css?v=2025-11-06SR1-gridLock1",
  "favicon.ico",
  "offline.html" // optional; will be skipped if missing
];

// Short-circuit early if an older worker is controlling
self.addEventListener("install", (e)=>{
  e.waitUntil((async()=>{
    const cache = await caches.open(CACHE_NAME);
    try { await cache.addAll(CORE); } catch(_) { /* ignore missing offline.html, etc. */ }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e)=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (!k.startsWith("oko-cache-")) return;
      if (k !== CACHE_NAME) return caches.delete(k);
    }));
    // Claim clients so new version starts immediately
    await self.clients.claim();
  })());
});

// Network with cache fallback; version-aware
self.addEventListener("fetch", (event)=>{
  const req = event.request;

  // Ignore non-GET
  if (req.method !== "GET") return;

  // Try cache first for core files, then network
  if (isCore(req.url)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // For API calls and images: network first, then cache fallback
  if (/okobserver-proxy\.bob-b5c\.workers\.dev/.test(req.url) || isMedia(req.url)) {
    event.respondWith(networkThenCache(req));
    return;
  }

  // Default: cache falling back to network
  event.respondWith(cacheThenNetwork(req));
});

function isCore(url){
  return CORE.some(entry => url.includes(entry.split("?")[0]));
}
function isMedia(url){
  return /\.(jpg|jpeg|png|webp|gif|mp4|m4v|mov)(\?|$)/i.test(url);
}

async function cacheFirst(req){
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req, {ignoreSearch:true});
  if (hit) return hit;
  try{
    const res = await fetch(req);
    cache.put(req, res.clone());
    return res;
  }catch(e){
    const offline = await cache.match("offline.html");
    if (offline) return offline;
    throw e;
  }
}

async function cacheThenNetwork(req){
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  const net = fetch(req).then(res=>{
    cache.put(req, res.clone());
    return res;
  }).catch(async ()=>{
    const offline = await cache.match("offline.html");
    if (offline) return offline;
    return hit || new Response("Offline", {status:503});
  });
  return hit || net;
}

async function networkThenCache(req){
  const cache = await caches.open(CACHE_NAME);
  try{
    const res = await fetch(req, {cache:"no-store"});
    cache.put(req, res.clone());
    return res;
  }catch(e){
    const hit = await cache.match(req);
    if (hit) return hit;
    const offline = await cache.match("offline.html");
    if (offline) return offline;
    throw e;
  }
}
