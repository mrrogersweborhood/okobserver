// 🟢 Full file: main.js v2025-11-11R1e • Hard route kick + loud logs + manual hooks + existing helpers
(function () {
  'use strict';

  var BUILD = '2025-11-11R1';
  console.log('[OkObserver] Main JS Build', BUILD);

  var API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  var app = document.getElementById('app');

  // --- Router ---------------------------------------------------------------
  window.addEventListener('hashchange', route);
  window.addEventListener('load', route);

  function route() {
    var hash = location.hash || '#/';
    console.log('[OkObserver] route()', hash);

    if (hash.startsWith('#/post/')) {
      var id = +hash.split('/')[2];
      renderDetail(id);
    } else if (hash.startsWith('#/about')) {
      renderAbout();
    } else {
      renderHome();
    }
    document.dispatchEvent(new CustomEvent('okobs:route', { detail: { hash: hash } }));
  }
  // expose manual trigger
  window.__ok_route = function(h){ if (h) location.hash = h; route(); };

  // --- Utilities ------------------------------------------------------------
  function niceDate(iso){
    try { var d=new Date(iso); return d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); }
    catch(e){ return iso; }
  }
  function decodeHTML(htmlString){
    if (!htmlString) return '';
    var div = document.createElement('div'); div.innerHTML = htmlString;
    return div.textContent || div.innerText || '';
  }

  // --- Home (grid + cartoon filter + infinite scroll) ----------------------
  var paging = { page: 1, busy: false, done: false };

  function ensureGrid(){
    var grid = app && app.querySelector('.posts-grid');
    if (!grid) {
      if (!app) app = document.getElementById('app');
      if (!app) { console.error('[OkObserver] #app missing'); return null; }
      grid = document.createElement('section');
      grid.className = 'posts-grid';
      app.innerHTML = '';
      app.appendChild(grid);
    }
    return grid;
  }

  function renderHome() {
    console.log('[OkObserver] renderHome() start');
    window.onscroll = null;
    var grid = ensureGrid();
    if (!grid) return;
    paging = { page: 1, busy: false, done: false };
    loadMore();
    window.onscroll = onScroll;
  }

  function onScroll() {
    if (paging.busy || paging.done) return;
    var nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 1000);
    if (nearBottom) loadMore();
  }

  function loadMore() {
    var grid = ensureGrid();
    if (!grid) return;
    if (paging.busy || paging.done) return;
    paging.busy = true;
    console.log('[OkObserver] loadMore page', paging.page);

    fetch(API + '/posts?_embed&per_page=12&page=' + paging.page)
      .then(function(r){
        console.log('[OkObserver] posts status', r.status);
        if (!r.ok) { if (r.status === 400 || r.status === 404) paging.done = true; throw new Error('no more'); }
        return r.json();
      })
      .then(function(arr){
        arr.forEach(function(p){
          var cats = (p._embedded && p._embedded['wp:term'] && p._embedded['wp:term'][0]) || [];
          var isCartoon = cats.some(function(c){
            var nm = (c.name || '').toLowerCase();
            var sl = (c.slug || '').toLowerCase();
            return nm.includes('cartoon') || sl.includes('cartoon');
          });
          if (isCartoon) return;

          var link = '#/post/' + p.id;
          var title = (p.title && p.title.rendered) || 'Untitled';
          var date = niceDate(p.date);

          var media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
          var src = media && (media.source_url || (media.media_details && media.media_details.sizes && (media.media_details.sizes.medium || media.media_details.sizes.full).source_url));

          var card = document.createElement('article');
          card.className = 'post-card';
          card.setAttribute('data-post-id', p.id);
          card.innerHTML =
            (src ? ('<a href="'+link+'"><img class="thumb" alt="" loading="lazy" src="'+src+'"></a>') : '') +
            '<div class="pad">'+
              '<h3><a href="'+link+'">'+title+'</a></h3>'+
              '<div class="byline">Oklahoma Observer — '+date+'</div>'+
              '<div class="excerpt">'+((p.excerpt && p.excerpt.rendered) || '')+'</div>'+
            '</div>';
          grid.appendChild(card);
        });

        paging.page += 1;
        paging.busy = false;
        console.log('[OkObserver] loadMore complete; next page', paging.page, 'done?', paging.done);
      })
      .catch(function(err){
        console.warn('[OkObserver] loadMore error:', err && (err.message || err));
        paging.busy = false;
        paging.done = true;
      });
  }
  // manual trigger
  window.__ok_loadMore = function(){ try { loadMore(); } catch(e){ console.error(e); } };

  // --- About ---------------------------------------------------------------
  function renderAbout() {
    window.onscroll = null;
    app.innerHTML = '<div class="post-detail"><h1>About</h1><p>The Oklahoma Observer…</p></div>';
    document.title = 'About – The Oklahoma Observer';
  }

  // --- Detail --------------------------------------------------------------
  function renderDetail(id) {
    window.onscroll = null;
    app.innerHTML =
      '<article class="post-detail">'+
        '<img class="hero" alt="" style="display:none" />'+
        '<h1 class="detail-title"></h1>'+
        '<div class="detail-byline"></div>'+
        '<div class="post-body"></div>'+
        '<p><a class="btn-back" href="#/">← Back to Posts</a></p>'+
      '</article>';

    fetch(API + '/posts/'+id+'?_embed')
      .then(function(r){ return r.json(); })
      .then(function(post){
        var rawTitle = (post.title && post.title.rendered) || '';
        var cleanTitle = decodeHTML(rawTitle);
        document.title = (cleanTitle ? cleanTitle + ' – ' : '') + 'The Oklahoma Observer';

        var hero = app.querySelector('.hero');
        var media = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
        var src = media && (media.source_url || (media.media_details && media.media_details.sizes && (media.media_details.sizes.large || media.media_details.sizes.full).source_url));
        if (src){ hero.src = src; hero.style.display='block'; }

        app.querySelector('.detail-title').innerHTML = rawTitle;
        app.querySelector('.detail-byline').textContent = 'Oklahoma Observer — ' + niceDate(post.date);
        app.querySelector('.post-body').innerHTML = (post.content && post.content.rendered) || 'Post loaded.';
      })
      .catch(function(){
        document.title = 'Post – The Oklahoma Observer';
        app.querySelector('.post-body').textContent = 'Post not found.';
      });
  }

  // **Hard kick**: if nothing rendered 500ms after load, force home once.
  window.addEventListener('load', function(){
    setTimeout(function(){
      var hasGrid = !!document.querySelector('.posts-grid');
      var isHome = (location.hash || '#/').indexOf('#/post/') !== 0 && (location.hash || '#/').indexOf('#/about') !== 0;
      if (!hasGrid && isHome) {
        console.warn('[OkObserver] grid missing after load — forcing home route');
        location.hash = '#/';
        route();
      }
    }, 500);
  });

})();
 
/* ======== HELPERS (unchanged behavior) ======== */
(function initHamburgerSafety() {
  var btn = document.querySelector('[data-oo="hamburger"]') || document.querySelector('.oo-hamburger') || document.getElementById('hamburger');
  var menu = document.querySelector('[data-oo="menu"]') || document.querySelector('.oo-menu') || document.getElementById('menu');
  var overlay = document.querySelector('[data-oo="overlay"]') || document.querySelector('.oo-overlay');
  if (!btn || !menu) { console.debug('[OkObserver] hamburger hooks not found — noop'); return; }
  var OPEN_CLASS = 'is-menu-open', target = document.getElementById('app') || document.body;
  var open = function(){ target.classList.add(OPEN_CLASS); }, close = function(){ target.classList.remove(OPEN_CLASS); }, isOpen = function(){ return target.classList.contains(OPEN_CLASS); };
  btn.addEventListener('click', function(e){ e.stopPropagation(); isOpen() ? close() : open(); }, { passive: true });
  document.addEventListener('click', function(e){ if (!isOpen()) return; if (menu.contains(e.target) || btn.contains(e.target)) return; close(); });
  if (overlay) overlay.addEventListener('click', close, { passive: true });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && isOpen()) close(); });
  menu.addEventListener('click', function(e){ var a = e.target.closest('a'); if (a) close(); });
  console.debug('[OkObserver] hamburger ready');
})();

(function initDuplicateGuardRouterAware(){
  var seen = new Set(), attachedTo;
  function scan(root, grid){
    var base = root || grid;
    var cards = base.querySelectorAll('.post-card');
    cards.forEach(function(card){
      var id = card.getAttribute('data-post-id') || '';
      if (!id) { var a = card.querySelector('a[href*="#/post/"]'); if (a) { var m = a.getAttribute('href').match(/#\/post\/(\d+)/); if (m) id = m[1]; } }
      if (!id) return;
      if (seen.has(id)) card.remove(); else seen.add(id);
    });
  }
  function attachIfNeeded() {
    var grid = document.querySelector('#app .posts-grid'); if (!grid) return;
    if (attachedTo === grid) return;
    attachedTo = grid; scan(grid, grid);
    var mo = new MutationObserver(function(muts){ muts.forEach(function(m){ m.addedNodes && m.addedNodes.forEach(function(n){ if (n.nodeType !== 1) return; if (n.classList && n.classList.contains('post-card')) scan(n.parentNode, grid); else if (n.querySelectorAll) scan(n, grid); }); }); });
    mo.observe(grid, { childList:true, subtree:true });
    window.__OkObsSeenIds = seen;
    console.log('[OkObserver] duplicate guard active');
  }
  attachIfNeeded();
  document.addEventListener('okobs:route', function(ev){
    if (!ev.detail) return; var h = ev.detail.hash || '#/';
    if (h.indexOf('#/post/') === 0) return; if (h.indexOf('#/about') === 0) return;
    setTimeout(attachIfNeeded, 0);
  });
})();

(function initVideoLogging(){
  if (location.hash.indexOf('#/post/') !== 0) return;
  var target = document.querySelector('#app .post-body'); if (!target) return;
  function logEmbeds(scope){ var root = scope || target; var ifr = root.querySelectorAll('iframe, video'); if (ifr.length){ ifr.forEach(function(el){ var src = el.getAttribute('src') || el.currentSrc || '(no src)'; console.log('[OkObserver] embed detected:', el.tagName, src); }); } }
  logEmbeds(target);
  var mo = new MutationObserver(function(muts){ muts.forEach(function(m){ m.addedNodes && m.addedNodes.forEach(function(n){ if (n.nodeType === 1){ if (n.matches && (n.matches('iframe') || n.matches('video'))) logEmbeds(n); else if (n.querySelectorAll) logEmbeds(n); } }); }); });
  mo.observe(target, { childList: true, subtree: true });
  if (location.hash.indexOf('#/post/381733') === 0) { console.log('[OkObserver] checking hard-fallback post 381733 for embeds…'); }
})();

(function okobsDiagnosticsR1(){
  if (window.__okobs_diag_installed) return; window.__okobs_diag_installed = true;
  var REAL_FETCH = window.fetch;
  window.fetch = function(input, init){
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var isWP = url.includes('/wp-json/wp/v2/posts');
    if (isWP) console.log('[OkObserver] fetching posts →', url);
    return REAL_FETCH.apply(this, arguments).then(function(res){
      if (isWP) {
        console.log('[OkObserver] posts status:', res.status);
        if (!res.ok) { res.clone().text().then(function(txt){ console.warn('[OkObserver] posts fetch failed:', res.status, String(txt).slice(0,150)); }); }
      }
      return res;
    }).catch(function(err){ if (isWP) console.error('[OkObserver] posts fetch error:', err); throw err; });
  };
  setTimeout(function(){ if ((location.hash || '#/').replace('#','') === '/' && !document.querySelector('#app .posts-grid')) { console.warn('[OkObserver] home grid not mounted yet.'); } }, 800);
})();
 // 🔴 main.js — END FULL FILE
