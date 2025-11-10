/* 🟢 main.js — FULL FILE REPLACEMENT
   OkObserver Build 2025-11-10R1-embedFix + grid/enforce + cartoonFilter + SW register
   This file is a complete replacement. Keep 🟢/🔴 markers. */

(function () {
  'use strict';

  // ==== BUILD TAG ============================================================
  var BUILD = '2025-11-10R1-embedFix';
  console.log('[OkObserver] Main JS Build', BUILD);

  // ==== CONSTANTS ============================================================
  var API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  var POSTS_PER_PAGE = 12;
  var CARTOON_CATEGORY_SLUGS = ['cartoon', 'cartoons']; // WP categories to exclude

  // ==== STATE ================================================================
  var state = {
    route: location.hash.replace('#', '') || '/home',
    posts: [],
    page: 1,
    done: false,
    loading: false,
    catsById: {}, // {id: {id, name, slug}}
    categoriesLoaded: false,
    scrollY: 0,
  };

  // ==== DOM HELPERS ==========================================================
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function qs(s, r) { return (r || document).querySelector(s); }
  function qsa(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }

  // ==== CATEGORIES (for cartoon filtering) ===================================
  function ensureCategories() {
    if (state.categoriesLoaded) return Promise.resolve();
    return fetch(API_BASE + '/categories?per_page=100')
      .then(function (r) { return r.json(); })
      .then(function (cats) {
        state.catsById = {};
        cats.forEach(function (c) { state.catsById[c.id] = c; });
        state.categoriesLoaded = true;
      })
      .catch(function () { /* ignore */ });
  }
  function isCartoon(post) {
    if (!post.categories || !post.categories.length) return false;
    for (var i = 0; i < post.categories.length; i++) {
      var c = state.catsById[post.categories[i]];
      if (c && CARTOON_CATEGORY_SLUGS.indexOf((c.slug || '').toLowerCase()) !== -1) return true;
    }
    // also consider common tag slugs if present
    if (post._embedded && post._embedded['wp:term']) {
      var terms = [].concat.apply([], post._embedded['wp:term']);
      for (var j = 0; j < terms.length; j++) {
        var t = terms[j];
        var slug = (t.slug || '').toLowerCase();
        if (slug === 'cartoon' || slug === 'cartoons') return true;
      }
    }
    return false;
  }

  // ==== FETCH HELPERS ========================================================
  function fetchPosts(page) {
    var url = API_BASE + '/posts?_embed=1&per_page=' + POSTS_PER_PAGE + '&page=' + page;
    return fetch(url).then(function (r) {
      state.done = !r.headers.get('Link') || !/rel="next"/.test(r.headers.get('Link'));
      return r.json();
    });
  }
  function featuredImage(post) {
    try {
      var m = post._embedded['wp:featuredmedia'];
      if (m && m[0] && m[0].source_url) return m[0].source_url + '?cb=' + post.id;
    } catch (e) {}
    return '';
  }

  // ==== RENDER HOME ==========================================================
  function postCard(post) {
    var img = featuredImage(post);
    var d = new Date(post.date);
    var card = el('article', 'post-card');
    card.innerHTML = [
      img ? ('<div class="card-media"><img alt="" src="' + img + '"></div>') : '',
      '<h2 class="card-title"><a href="#/post/' + post.id + '">' + (post.title && post.title.rendered || '') + '</a></h2>',
      '<div class="card-meta"><strong>Oklahoma Observer</strong> — ' + d.toLocaleDateString() + '</div>',
      '<div class="card-excerpt">' + (post.excerpt && post.excerpt.rendered || '') + '</div>',
    ].join('');
    return card;
  }

  function renderHome(initial) {
    var app = qs('#app');
    if (initial) app.innerHTML = [
      '<section class="posts-wrap">',
        '<div class="posts-grid" id="postsGrid"></div>',
        '<div id="feedSentinel" class="feed-sentinel" aria-hidden="true"></div>',
      '</section>'
    ].join('');

    // grid enforce (4/3/1)
    var grid = qs('#postsGrid');
    if (grid && !grid.classList.contains('grid-enforced')) {
      grid.classList.add('grid-enforced');
      grid.style.display = 'grid';
      grid.style.gridGap = '16px';
      function setCols() {
        var w = grid.clientWidth || window.innerWidth;
        var cols = w >= 1200 ? 4 : (w >= 800 ? 3 : 1);
        grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
      }
      setCols();
      window.addEventListener('resize', setCols);
    }

    // fill visible cards
    var gridEl = qs('#postsGrid');
    var frag = document.createDocumentFragment();
    state.posts.forEach(function (p) {
      if (!p.__drawn) {
        p.__drawn = true;
        frag.appendChild(postCard(p));
      }
    });
    gridEl.appendChild(frag);

    // sentinel for infinite
    ensureInfinite();
  }

  // ==== INFINITE SCROLL ======================================================
  var io;
  function ensureInfinite() {
    if (io) return;
    var sent = qs('#feedSentinel');
    if (!sent) return;
    io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (e.isIntersecting) loadMore();
      });
    }, { rootMargin: '600px' });
    io.observe(sent);
  }

  function loadMore() {
    if (state.loading || state.done) return;
    state.loading = true;
    var next = state.page + 1;

    ensureCategories()
      .then(function () { return fetchPosts(next); })
      .then(function (rows) {
        rows.forEach(function (p) { p._ok_featuredImg = featuredImage(p); });
        // filter cartoons
        var filtered = rows.filter(function (p) { return !isCartoon(p); });
        state.posts = state.posts.concat(filtered);
        state.page = next;
        renderHome(false);
      })
      .catch(function () { /* ignore */ })
      .finally(function () { state.loading = false; });
  }

  // ==== RENDER DETAIL (wired to PostDetail.js) ===============================
  function renderDetail(id) {
    var app = qs('#app');
    app.innerHTML = '<div class="loading">Loading…</div>';

    ensureCategories()
      .then(function () {
        return fetch(API_BASE + '/posts/' + id + '?_embed=1').then(function (r) { return r.json(); });
      })
      .then(function (post) {
        post._ok_featuredImg = featuredImage(post);
        if (window.renderPostDetail) {
          window.renderPostDetail(post);
        } else {
          // Fallback simple renderer if PostDetail.js isn’t loaded for any reason
          var d = new Date(post.date);
          app.innerHTML = [
            '<article class="post-detail">',
              '<header class="post-header">',
                '<h1 class="post-title">', (post.title && post.title.rendered || ''), '</h1>',
                '<div class="post-meta"><strong>Oklahoma Observer</strong> — ', d.toLocaleDateString(), '</div>',
              '</header>',
              post._ok_featuredImg ? ('<figure class="post-hero"><img class="post-hero-img" src="' + post._ok_featuredImg + '"></figure>') : '',
              '<section class="post-body">', (post.content && post.content.rendered || ''), '</section>',
              '<nav class="post-nav"><button class="back-btn" onclick="history.back()">← Back to Posts</button></nav>',
            '</article>'
          ].join('');
        }
      })
      .catch(function () {
        app.innerHTML = '<p class="error">Unable to load this post.</p>';
      });
  }

  // ==== ROUTER ===============================================================
  function parseRoute() {
    var h = location.hash.replace('#', '');
    if (!h || h === '/' || h === '/home') return { name: 'home' };
    var m = h.match(/^\/post\/(\d+)/);
    if (m) return { name: 'detail', id: m[1] };
    return { name: 'home' };
  }

  function router() {
    var r = parseRoute();
    state.route = r.name;
    if (r.name === 'home') {
      state.scrollY = 0;
      if (!state.posts.length) {
        // first load
        ensureCategories()
          .then(function () { return fetchPosts(1); })
          .then(function (rows) {
            rows.forEach(function (p) { p._ok_featuredImg = featuredImage(p); });
            state.posts = rows.filter(function (p) { return !isCartoon(p); });
            state.page = 1;
            state.done = state.posts.length < POSTS_PER_PAGE;
            renderHome(true);
          })
          .catch(function () {
            qs('#app').innerHTML = '<p class="error">Unable to load posts.</p>';
          });
      } else {
        renderHome(true);
      }
    } else if (r.name === 'detail') {
      renderDetail(r.id);
    }
  }

  window.addEventListener('hashchange', router);
  window.addEventListener('DOMContentLoaded', function () {
    // inject app shell if not present
    if (!qs('#app')) {
      var root = el('div');
      root.id = 'app';
      document.body.appendChild(root);
    }
    router();
  });

  // ==== SERVICE WORKER (light-touch) ========================================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        console.log('[OkObserver SW] registered:', reg.scope);
      }).catch(function (err) {
        console.log('[OkObserver SW] register failed:', err);
      });
    });
  }

  // ==== SMALL STYLE GUARDS (in case CSS missed) ==============================
  // keep grid layout sane even if CSS fails to load
  (function gridEnforcer() {
    var obs = new MutationObserver(function () {
      var g = qs('.posts-grid');
      if (g) {
        if (getComputedStyle(g).display !== 'grid') g.style.display = 'grid';
        if (!g.style.gridTemplateColumns) {
          var w = g.clientWidth || window.innerWidth;
          var cols = w >= 1200 ? 4 : (w >= 800 ? 3 : 1);
          g.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0,1fr))';
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  })();

})();
 
/* 🔴 main.js — END FULL FILE */
