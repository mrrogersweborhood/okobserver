/* OkObserver · main.js · v2.7.1 (module cache-busting) */
console.log('[OkObserver] main.js v2.7.1 booting');

// Lock API to Cloudflare Worker
window.OKO_API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

// bump this string anytime you want fresh module fetches
const V = 'v=271';

import renderHome   from `./home.v263.js?${V}`;
import renderAbout  from `./about.v263.js?${V}`;
import renderDetail from `./detail.v263.js?${V}`;

async function router() {
  const hash = location.hash || '#/';
  const app = document.getElementById('app');
  if (!app) return;

  if (hash === '#/' || hash === '' || hash.startsWith('#/page/')) {
    await renderHome(app);
  } else if (hash.startsWith('#/post/')) {
    const id = hash.split('/')[2];
    await renderDetail(app, id);
  } else if (hash.startsWith('#/about')) {
    await renderAbout(app);
  } else {
    app.innerHTML = `<p>Page not found.</p>`;
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
