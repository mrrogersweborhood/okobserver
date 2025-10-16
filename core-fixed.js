/* ---------------------------------------------------
   core-fixed.js — OkObserver Core Logic (Optimized)
   ---------------------------------------------------
   This is your stable base logic with non-breaking
   performance and caching enhancements added.
--------------------------------------------------- */

// ------------------------
// Safe global constants
// ------------------------
window.OKO_API_BASE = window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
console.log('[OkObserver] core-fixed.js initialized:', window.OKO_API_BASE);

// ------------------------
// Utility Functions
// ------------------------
function qs(sel, scope=document){ return scope.querySelector(sel); }
function qsa(sel, scope=document){ return Array.from(scope.querySelectorAll(sel)); }
function decode(str){ const txt = document.createElement('textarea'); txt.innerHTML = str; return txt.value; }
function prettyDate(str){ try { return new Date(str).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}); } catch { return str; } }
function stripEmptyBlocks(html){ return html.replace(/<p>(\s|&nbsp;)*<\/p>/g,'').trim(); }
function featuredSrc(post){ return post._embedded?.['wp:featuredmedia']?.[0]?.source_url || ''; }

// ------------------------
// Mutation Observer Grid Fix
// ------------------------
const gridObserver = new MutationObserver(() => {
  const grid = document.querySelector('.ok-grid');
  if (!grid) return;
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
  grid.style.gap = '1.25rem';
});
gridObserver.observe(document.body, {childList:true, subtree:true});

// ------------------------
// Micro Response Cache (Safe)
// ------------------------
(function(){
  const __memCache = new Map();

  async function cachedJSON(url, init){
    if (__memCache.has(url)) {
      console.log('[cache hit]', url);
      return __memCache.get(url);
    }
    console.log('[cache miss]', url);
    const p = fetch(url, init || {headers:{accept:'application/json'}}).then(r=>{
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    });
    __memCache.set(url, p);
    try { return await p; }
    finally {
      if (__memCache.size > 50) {
        const first = __memCache.keys().next().value;
        __memCache.delete(first);
      }
    }
  }

  // Safe global exposure
  window.cachedJSON = cachedJSON;
})();

// ------------------------
// Non-breaking Cached API Helper
// ------------------------
async function apiJSONCached(pathOrUrl, params){
  const mkUrl = (base, p) => {
    const qs = new URLSearchParams();
    for (const [k,v] of Object.entries(p||{})) {
      if (v==null || v==='') continue;
      Array.isArray(v) ? v.forEach(x=>qs.append(k,x)) : qs.append(k,v);
    }
    const q = qs.toString();
    return pathOrUrl.startsWith('http')
      ? (pathOrUrl + (q?`?${q}`:'')) 
      : (base.replace(/\/+$/,'') + '/' + pathOrUrl.replace(/^\/+/,'') + (q?`?${q}`:''));
  };

  const base = window.OKO_API_BASE;
  const url  = mkUrl(base, params);
  return window.cachedJSON(url, {headers:{accept:'application/json'}});
}

// ------------------------
// Passive Event Listeners
// ------------------------
(function(){
  try {
    ['scroll','touchstart','touchmove','wheel'].forEach(t => {
      window.addEventListener(t, ()=>{}, {passive:true});
    });
    console.log('[OkObserver] Passive listeners enabled.');
  } catch(err){
    console.warn('[OkObserver] Passive listener registration failed:', err);
  }
})();

// ------------------------
// Scroll Restore Utility
// ------------------------
(function(){
  let lastScroll = 0;
  window.addEventListener('scroll', () => { lastScroll = window.scrollY; }, {passive:true});
  window.addEventListener('hashchange', () => {
    requestAnimationFrame(()=>window.scrollTo(0,lastScroll));
  });
})();

// ------------------------
// DOM Ready Helper
// ------------------------
function onReady(fn){ 
  if(document.readyState !== 'loading') fn();
  else document.addEventListener('DOMContentLoaded', fn);
}

// ------------------------
// Global Error Handler
// ------------------------
window.addEventListener('error', (e)=>{
  console.error('[OkObserver error]', e.message, e.filename, e.lineno);
});
window.addEventListener('unhandledrejection', (e)=>{
  console.error('[OkObserver promise]', e.reason);
});

console.log('[OkObserver] core-fixed.js loaded successfully.');
