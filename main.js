// 🟢 Full file: main.js v2025-11-11R1c + router-aware duplicate guard + hamburger + video logs + diagR1
/* 🟢 main.js — FULL FILE REPLACEMENT
   OkObserver Build 2025-11-11R1-headerHamburger
   Guarantees:
     • Zero regression, no ES modules, plain JS only
     • One fetch per page (home), infinite scroll intact
     • Cartoon category filtered
     • Grid enforcer & sticky header unaffected
     • Append-only utilities at bottom (hamburger, dedupe, logs, diagnostics)
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

    // Announce route changes so helpers (dedupe) can react
    document.dispatchEvent(new CustomEvent('okobs:route', { detail: { hash: hash } }));
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
      .then(function(r){
        if (!r.ok) { if (r.status === 400 || r.status === 404) paging.done = true; throw new Error('no more'); }
        return r.json();
      })
      .then(function(arr){
        var grid = app.querySelector('.posts-grid');
        arr.forEach(function(p){
          // CATEGORY cartoon filter
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
              '<div class="excerpt">'+((p.excerpt && p.excerpt.rendered) || '')+'</div>'+
            '</div>';
          grid.appendChild(card);
        });

        paging.page += 1;
        paging.busy = false;
      })
      .catch(function(){
        paging.busy = false;
        paging.done = true;
      });

    // grid defensive (ensure section exists)
    setTimeout(function(){
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

})();

/* ======== APPEND-ONLY HELPERS BELOW (no changes to core logic above) ======== */

/** Hamburger toggle + auto-close (safe no-op if hooks not present) */
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

/** Infinite-scroll duplicate guard (router-aware attach) */
(function initDuplicateGuardRouterAware(){
  var seen = new Set();
  var attachedTo; // current grid element observed

  function scan(root, grid){
    var base = root || grid;
    var cards = base.querySelectorAll('.post-card');
    cards.forEach(function(card){
      var id = card.getAttribute('data-post-id') || '';
      if (!id) {
        var a = card.querySelector('a[href*="#/post/"]');
        if (a) {
          var m = a.getAttribute('href').match(/#\/post\/(\d+)/);
          if (m) id = m[1];
        }
      }
      if (!id) return;
      if (seen.has(id)) card.remove();
      else seen.add(id);
    });
  }

  function attachIfNeeded() {
    var grid = document.querySelector('#app .posts-grid');
    if (!grid) return;

    if (attachedTo === grid) return; // already observing this grid

    // (Re)attach to this grid
    attachedTo = grid;
    scan(grid, grid);

    var mo = new MutationObserver(function(muts){
      muts.forEach(function(m){
        m.addedNodes && m.addedNodes.forEach(function(n){
          if (n.nodeType !== 1) return;
          if (n.classList && n.classList.contains('post-card')) scan(n.parentNode, grid);
          else if (n.querySelectorAll) scan(n, grid);
        });
      });
    });
    mo.observe(grid, { childList:true, subtree:true });

    window.__OkObsSeenIds = seen;
    console.debug('[OkObserver] duplicate guard active');
  }

  // Try now (if home already rendered)
  attachIfNeeded();

  // Re-attempt on route changes (works when returning from detail/about)
  document.addEventListener('okobs:route', function(ev){
    if (!ev.detail) return;
    var h = ev.detail.hash || '#/';
    if (h.indexOf('#/post/') === 0) return;
    if (h.indexOf('#/about') === 0) return;
    setTimeout(attachIfNeeded, 0);
  });
})();

/** Dev-only video logging (helps verify embeds & hard fallback post) */
(function initVideoLogging(){
  if (location.hash.indexOf('#/post/') !== 0) return; // only on detail
  var target = document.querySelector('#app .post-body');
  if (!target) return;

  function logEmbeds(scope){
    var root = scope || target;
    var iframes = root.querySelectorAll('iframe, video');
    if (iframes.length) {
      iframes.forEach(function(el){
        var src = el.getAttribute('src') || el.currentSrc || '(no src)';
        console.debug('[OkObserver] embed detected:', el.tagName, src);
      });
    }
  }

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

  if (location.hash.indexOf('#/post/381733') === 0) {
    console.debug('[OkObserver] checking hard-fallback post 381733 for embeds…');
  }
})();

/** OkObserver diagR1 — proxy fetch diagnostics (append-only, safe if proxy OK)
 *  - Logs post fetches & statuses
 *  - On first failure shows a fixed top dev banner with a Retry button
 */
(function okobsDiagnosticsR1(){
  if (window.__okobs_diag_installed) return;
  window.__okobs_diag_installed = true;

  function showDevBanner(message, retry) {
    try {
      if (document.getElementById('okobs-dev-banner')) return;
      var bar = document.createElement('div');
      bar.id = 'okobs-dev-banner';
      bar.style.cssText = [
        'position:fixed;left:0;right:0;top:0;z-index:9999;',
        'background:#222;color:#fff;font:14px/1.4 system-ui,Segoe UI,Roboto,Arial,sans-serif;',
        'padding:8px 12px;box-shadow:0 2px 10px rgba(0,0,0,.25)'
      ].join('');
      bar.innerHTML = '<strong>OkObserver:</strong> '+ (message || 'Fetch failed.') +
        (retry ? ' <button id="okobs-retry" style="margin-left:8px;background:#1E90FF;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer">Retry</button>' : '');
      document.body.appendChild(bar);
      var btn = document.getElementById('okobs-retry');
      if (btn) btn.addEventListener('click', function(){
        location.hash = '#/';
        setTimeout(function(){ location.reload(); }, 50);
      });
    } catch(e){}
  }

  var REAL_FETCH = window.fetch;
  window.fetch = function(input, init){
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var isWP = url.includes('/wp-json/wp/v2/posts');
    if (isWP) console.debug('[OkObserver] fetching posts →', url);

    return REAL_FETCH.apply(this, arguments).then(function(res){
      if (isWP) {
        console.debug('[OkObserver] posts status:', res.status);
        if (!res.ok) {
          res.clone().text().then(function(txt){
            console.warn('[OkObserver] posts fetch failed:', res.status, String(txt).slice(0,150));
            showDevBanner('Proxy returned '+res.status+' for posts. See console for details.', true);
          }).catch(function(){
            showDevBanner('Proxy request failed. Status '+res.status, true);
          });
        }
      }
      return res;
    }).catch(function(err){
      if (isWP) {
        console.error('[OkObserver] posts fetch error:', err);
        showDevBanner('Network error contacting proxy. Check connection/CORS.', true);
      }
      throw err;
    });
  };

  // Hint if home grid not yet mounted (can be normal briefly)
  setTimeout(function(){
    if ((location.hash || '#/').replace('#','') === '/' && !document.querySelector('#app .posts-grid')) {
      console.debug('[OkObserver] home grid not mounted yet (this can be normal briefly).');
    }
  }, 800);
})();

// 🔴 main.js — END FULL FILE
