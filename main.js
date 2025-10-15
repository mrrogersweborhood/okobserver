/* OkObserver · main.js · v2.6.5 */
console.log('[OkObserver] main.js v2.6.5 booting');
window.OKO_API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
const routes = {
  '/': async (app) => (await import('./home.v263.js')).default(app),
  '/post/:id': async (app, id) => (await import('./detail.v263.js')).default(app, id),
  '/about': async (app) => (await import('./about.v263.js')).default(app),
};
async function router(){
  const hash = location.hash || '#/'; const path = hash.replace(/^#/, ''); const app = document.getElementById('app'); if(!app) return;
  if(!path.startsWith('/post/')){ const y = parseInt(sessionStorage.getItem('oko-scroll-home')||'0',10); requestAnimationFrame(()=>window.scrollTo(0,y)); }
  try{
    if(path==='/'||path==='') return routes['/'](app);
    if(path.startsWith('/post/')){ const id = path.split('/')[2]; return routes['/post/:id'](app, id); }
    if(path.startsWith('/about')) return routes['/about'](app);
    app.innerHTML = '<section class="page-error"><p>Page not found.</p></section>';
  }catch(err){ console.error('[Router error]', err); app.innerHTML = '<section class="page-error"><p>Failed to load page.</p></section>'; }
}
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('[SW] registration failed:', e)); }
