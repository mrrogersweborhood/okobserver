// 🟢 sw.js — start of full file
/* OkObserver Service Worker — single stable version */
const CACHE = 'okobserver-cache-v1';
const OFFLINE_URL = '/okobserver/offline.html';
const ASSETS = [
  '/okobserver/',
  '/okobserver/index.html',
  '/okobserver/override.css',
  '/okobserver/main.js',
  '/okobserver/PostDetail.js',
  '/okobserver/logo.png',
  '/okobserver/favicon.ico',
  OFFLINE_URL
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE && caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHTML(req) {
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', e => {
  const req = e.request;

  if (isHTML(req)) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, {ignoreSearch:true}).then(r => r || caches.match(OFFLINE_URL)))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(OFFLINE_URL)))
  );
});
// 🔴 sw.js — end of full file
