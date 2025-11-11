// 🟢 Full file: main.js v2025-11-11R1 + append-only: hamburger + duplicate guard + video logs
/* 🟢 main.js — FULL FILE REPLACEMENT (append-only changes at bottom)
   OkObserver Build 2025-11-11R1
   Policy: zero-regression, no truncation, no selector renames.
*/

(function () {
  'use strict';

  var BUILD = '2025-11-11R1';
  console.log('[OkObserver] Main JS Build', BUILD);

  var API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  var app = document.getElementById('app');

  // Router
  window.addEventListener('hashchange', route);
  window.addEventListener('load', route);

  function route() {
    var hash = location.hash || '#/';
    if (hash.startsWith('#/post/')) {
      var id = +hash.split('/')[2];
      renderDetail(id);
    } else if (hash.startsWith('#/about')) {
      renderAbout();
    } else {
      renderHome();
    }
  }

  // Utilities
  function niceDate(iso){
    try { var d=new Date(iso); return d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); }
    catch(e){ return iso; }
  }
  // Decode WordPress title HTML entities safely
  function decodeHTML(htmlString){
    if (!htmlString) return '';
    var div = document.createElement('div');
    div.innerHTML = htmlString;
    return div.textContent || div.innerText || '';
  }

  // Home (grid + cartoon filter + infinite scroll)
  var paging = { page: 1, busy: false, done: false };
  function renderHome() {
    app.innerHTML = '<section class="posts-grid" aria-label="Posts grid"></section>';
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
    paging.busy = true;
    fetch(API + '/posts?_embed&per_page=12&page=' + paging.page)
      .then(r => {
        if (!r.ok) { if (r.status === 400 || r.status === 404) paging.done = true; throw new Error('no more'); }
        return r.json();
      })
      .then(arr => {
        var grid = app.querySelector('.posts-grid');
        arr.forEach(p => {
          // CATEGORY cartoon filter
          var cats = (p._embedded && p._embedded['wp:term'] && p._embedded['wp:term'][0]) || [];
          var isCartoon = cats.some(c => {
            var nm = (c.name || '').toLowerCase();
            var sl = (c.slug || '').toLowerCase();
            return nm.includes('cartoon') || sl.includes('cartoon');
          });
          if (isCartoon) return;

          var link = '#/post/' + p.id;
          var title = p.title && p.title.rendered || 'Untitled';
          var date = niceDate(p.date);

          // featured image
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
            '<div class="excerpt">'+(p.excerpt && p.excerpt.rendered || '')+'</div>'+
            '</div>';
          grid.appendChild(card);
        });

        paging.page += 1;
        paging.busy = false;
      })
      .catch(() => { paging.busy = false; paging.done = true; });

    // grid defensive
    setTimeout(() => {
      var g = app.querySelector('.posts-grid');
      if (!g) {
        var s = document.createElement('section'); s.className='posts-grid'; app.prepend(s);
      }
    }, 0);
  }

  // About
  function renderAbout() {
    window.onscroll = null;
    app.innerHTML = '<div class="post-detail"><h1>About</h1><p>The Oklahoma Observer…</p></div>';
    document.title = 'About – The Oklahoma Observer';
  }

  // Detail shell; content filled and video normalized by PostDetail.js
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

    fetch(API + '/posts/'+id+'?_embed').then(r=>r.json()).then(post=>{
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
    }).catch(function(){
      document.title = 'Post – The Oklahoma Observer';
      app.querySelector('.post-body').textContent = 'Post not found.';
    });
  }

})();

/* ======== APPEND-ONLY ADDITIONS BELOW (no changes to existing code) ======== */

/** 1) Hamburger toggle + auto-close (safe no-op if hooks not present) */
(function initHamburgerSafety() {
  var root = document.body || document.documentElement;
  var appRoot = document.getElementById('app') || root;

  var btn = document.querySelector('[data-oo="hamburger"]')
           || document.querySelector('.oo-hamburger')
           || document.getElementById('hamburger');
  var menu = document.querySelector('[data-oo="menu"]')
            || document.querySelector('.oo-menu')
            || document.getElementById('menu');
  var overlay = document.querySelector('[data-oo="overlay"]')
               || document.querySelector('.oo-overlay');

  if (!btn || !menu) {
    console.debug('[OkObserver] hamburger hooks not found — noop');
    return;
  }

  var OPEN_CLASS = 'is-menu-open';
  var open = function(){ (document.getElementById('app')||document.body).classList.add(OPEN_CLASS); };
  var close = function(){ (document.getElementById('app')||document.body).classList.remove(OPEN_CLASS); };
  var isOpen = function(){ return (document.getElementById('app')||document.body).classList.contains(OPEN_CLASS); };

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    isOpen() ? close() : open();
  }, { passive: true });

  document.addEventListener('click', function(e){
    if (!isOpen()) return;
    if (menu.contains(e.target) || btn.contains(e.target)) return;
    close();
  });

  if (overlay) overlay.addEventListener('click', close, { passive: true });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && isOpen()) close(); });
  menu.addEventListener('click', function(e){ var a = e.target.closest('a'); if (a) close(); });

  console.debug('[OkObserver] hamburger ready');
})();

/** 2) Infinite-scroll duplicate guard (append-only, DOM-level)
 *    Keeps a Set of seen post IDs; if a duplicate card appears, remove it.
 *    Works without touching your existing loadMore() implementation.
 */
(function initDuplicateGuard(){
  var seen = new Set();
  var grid = document.querySelector('#app .posts-grid');
  if (!grid) return;

  var scan = function(root){
    var cards = (root || grid).querySelectorAll('.post-card');
    cards.forEach(function(card){
      var id = card.getAttribute('data-post-id') || '';
      if (!id) {
        // fallback: parse from the first link href "#/post/123"
        var a = card.querySelector('a[href*="#/post/"]');
        if (a) {
          var m = a.getAttribute('href').match(/#\/post\/(\d+)/);
          if (m) id = m[1];
        }
      }
      if (!id) return; // can't identify

      if (seen.has(id)) {
        card.remove(); // dedupe
      } else {
        seen.add(id);
      }
    });
  };

  // initial pass + observe further appends
  scan(grid);
  var mo = new MutationObserver(function(muts){
    muts.forEach(function(m){
      m.addedNodes && m.addedNodes.forEach(function(n){
        if (n.nodeType === 1) {
          if (n.classList && n.classList.contains('post-card')) scan(n.parentNode);
          else if (n.querySelectorAll) scan(n);
        }
      });
    });
  });
  mo.observe(grid, { childList: true, subtree: true });

  // Expose for debugging
  window.__OkObsSeenIds = seen;
  console.debug('[OkObserver] duplicate guard active');
})();

/** 3) Dev-only video logging (helps verify embeds & the hard fallback post)
 *    Logs when iframes/videos appear in .post-body, including source hints.
 */
(function initVideoLogging(){
  if (location.hash.indexOf('#/post/') !== 0) return; // only on detail
  var target = document.querySelector('#app .post-body');
  if (!target) return;

  var logEmbeds = function(scope){
    var root = scope || target;
    var iframes = root.querySelectorAll('iframe, video');
    if (iframes.length) {
      iframes.forEach(function(el){
        var src = el.getAttribute('src') || el.currentSrc || '(no src)';
        console.debug('[OkObserver] embed detected:', el.tagName, src);
      });
    }
  };

  // initial & observe
  logEmbeds(target);
  var mo = new MutationObserver(function(muts){
    muts.forEach(function(m){
      m.addedNodes && m.addedNodes.forEach(function(n){
        if (n.nodeType === 1) {
          if (n.matches && (n.matches('iframe') || n.matches('video'))) logEmbeds(n);
          else if (n.querySelectorAll) logEmbeds(n);
        }
      });
    });
  });
  mo.observe(target, { childList: true, subtree: true });

  // Special notice for hard-fallback post
  if (location.hash.indexOf('#/post/381733') === 0) {
    console.debug('[OkObserver] checking hard-fallback post 381733 for embeds…');
  }
})();
 /* 🔴 main.js — END FULL FILE */
