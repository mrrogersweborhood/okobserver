/* OkObserver · main.js · v2.6.9
   Stable router w/ cache-busting, Cloudflare proxy locked
*/
import renderHome from './home.v263.js';
import renderAbout from './about.v263.js';
import renderDetail from './detail.v263.js';

console.log('[OkObserver] main.js v2.6.9 booting');
window.OKO_API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

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
