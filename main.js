/* 🟢 main.js — FULL REPLACEMENT — Build 2025-11-10R3-infiniteFix1
   Notes:
   - Plain JS (no modules) for GH Pages
   - Keeps 4/3/1 layout via CSS classes (grid handled in override.css)
   - Filters out WordPress “cartoon” category by slug or name match
   - Infinite scroll: resilient to filtered/short pages (chains fetches)
   - One network page per fetch; return-to-scroll intact
   - Video/embed scan left in but non-destructive
*/

(function () {
  'use strict';

  // ========= Build/Config =========
  var BUILD = '2025-11-10R3-infiniteFix1';
  var API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  var PER_PAGE = 12;                       // WP page size to request
  var CARTOON_SLUGS = ['cartoon', 'cartoons'];
  var SCROLL_KEY = 'okobs.return.scrollY';
  var ROUTES = {
    HOME: '#/posts',
    POST: '#/post/'
  };

  console.log('[OkObserver] Main JS Build', BUILD);

  // ========= DOM helpers =========
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  // ========= App state =========
  var state = {
    page: 0,
    posts: [],
    loading: false,
    done: false,
    catMap: {},   // id -> {id, name, slug}
    categoriesLoaded: false
  };

  // ========= Router =========
  window.addEventListener('hashchange', router);
  document.addEventListener('DOMContentLoaded', router);

  function router() {
    var h = location.hash || ROUTES.HOME;
    if (h.indexOf(ROUTES.POST) === 0) {
      var id = parseInt(h.replace(ROUTES.POST, ''), 10);
      renderPostDetail(id);
      return;
    }
    renderHome(true);
  }

  // ========= Fetch helpers =========
  function wp(endpoint, params) {
    var url = API + endpoint;
    if (params) {
      var query = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
      url += (url.indexOf('?') === -1 ? '?' : '&') + query;
    }
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // carry pagination signal
      var link = r.headers.get('link') || r.headers.get('Link');
      var more = link && /rel="next"/i.test(link);
      return r.json().then(function (json) {
        return { json: json, more: more };
      });
    });
  }

  function ensureCategories() {
    if (state.categoriesLoaded) return Promise.resolve();
    return wp('/categories', { per_page: 100 }).then(function (res) {
      (res.json || []).forEach(function (c) { state.catMap[c.id] = c; });
      state.categoriesLoaded = true;
    }).catch(function () {
      // Non-fatal; filtering will fallback to name text we already fetch per post
      state.categoriesLoaded = true;
    });
  }

  function fetchPosts(pageNum) {
    return wp('/posts', {
      _embed: 1,
      page: pageNum,
      per_page: PER_PAGE,
      order: 'desc',
      orderby: 'date',
      status: 'publish'
    }).then(function (res) {
      state.done = !res.more;
      return res.json || [];
    });
  }

  function fetchPost(id) {
    return wp('/posts/' + id, { _embed: 1 }).then(function (res) {
      return res.json;
    });
  }

  // ========= Filters / mapping =========
  function isCartoon(post) {
    // Prefer category slug from embedded taxonomy if present
    // WP: post._embedded['wp:term'][0] is categories array
    try {
      var cats = (post._embedded && post._embedded['wp:term'] && post._embedded['wp:term'][0]) || [];
      for (var i = 0; i < cats.length; i++) {
        var c = cats[i];
        var slug = (c && c.slug || '').toLowerCase();
        var name = (c && c.name || '').toLowerCase();
        if (CARTOON_SLUGS.indexOf(slug) !== -1) return true;
        if (name.indexOf('cartoon') !== -1) return true;
      }
    } catch (e) {}
    // Fallback: if we fetched categories separately
    if (post.categories && post.categories.length) {
      for (var j = 0; j < post.categories.length; j++) {
        var cid = post.categories[j];
        var meta = state.catMap[cid];
        if (!meta) continue;
        var s = (meta.slug || '').toLowerCase();
        var n = (meta.name || '').toLowerCase();
        if (CARTOON_SLUGS.indexOf(s) !== -1) return true;
        if (n.indexOf('cartoon') !== -1) return true;
      }
    }
    return false;
  }

  function getFeatured(post) {
    try {
      var m = post._embedded['wp:featuredmedia'];
      if (m && m[0] && m[0].media_details && m[0].media_details.sizes) {
        var sizes = m[0].media_details.sizes;
        var best = sizes.medium_large || sizes.large || sizes.full || sizes.medium || sizes.thumbnail;
        if (best && best.source_url) return best.source_url + '?cb=' + post.id;
      }
    } catch (e) {}
    return '';
  }

  // ========= Render: Home =========
  var io; // IntersectionObserver

  function renderHome(initial) {
    var app = qs('#app');
    if (!app) {
      document.body.innerHTML = '<div id="app"></div>';
      app = qs('#app');
    }
    app.innerHTML = headerHTML() + '<main id="home"><div id="grid" class="posts-grid"></div><div id="feedSentinel" aria-hidden="true" style="height:1px"></div></main>' + footerHTML();

    var grid = qs('#grid');
    // First-time fill from existing state
    state.posts.forEach(function (p) {
      grid.appendChild(postCard(p));
    });

    // Kickstart infinite if needed
    if (initial) {
      // restore scroll (return-to-scroll)
      var y = +sessionStorage.getItem(SCROLL_KEY) || 0;
      if (y > 0) requestAnimationFrame(function () { window.scrollTo(0, y); });

      if (state.page === 0 && !state.loading && !state.done) {
        loadMore();
      }
    }

    ensureInfinite();
    rearmInfinite();
  }

  function postCard(post) {
    var card = el('article', 'post-card');
    // Clickable featured image
    var imgSrc = getFeatured(post);
    if (imgSrc) {
      var aImg = el('a', 'card-image');
      aImg.href = ROUTES.POST + post.id;
      var img = el('img');
      img.src = imgSrc;
      img.alt = (post.title && post.title.rendered ? strip(post.title.rendered) : 'Featured image');
      img.loading = 'lazy';
      aImg.appendChild(img);
      card.appendChild(aImg);
    }

    var titleA = el('a', 'card-title');
    titleA.href = ROUTES.POST + post.id;
    titleA.innerHTML = (post.title && post.title.rendered) || 'Untitled';
    card.appendChild(titleA);

    var by = el('div', 'card-byline');
    by.innerHTML = '<strong>Oklahoma Observer</strong> — ' + niceDate(post.date);
    card.appendChild(by);

    var ex = el('div', 'card-excerpt');
    ex.innerHTML = (post.excerpt && post.excerpt.rendered) || '';
    card.appendChild(ex);

    return card;
  }

  // ========= Infinite Scroll (FIXED) =========
  function loadMore() {
    if (state.loading || state.done) return;
    state.loading = true;
    var next = state.page + 1;

    ensureCategories()
      .then(function () { return fetchPosts(next); })
      .then(function (rows) {
        // map images early for layout stability
        rows.forEach(function (p) { p._ok_img = getFeatured(p); });
        var filtered = rows.filter(function (p) { return !isCartoon(p); });

        // append
        var grid = qs('#grid');
        filtered.forEach(function (p) {
          state.posts.push(p);
          grid.appendChild(postCard(p));
        });
        state.page = next;

        // If filtered batch is thin, auto-chain another page to avoid “stall at 7”
        var THRESHOLD = Math.max(4, Math.floor(PER_PAGE * 0.5)); // ≥50% of page or at least 4
        if (!state.done && filtered.length < THRESHOLD) {
          // allow paint, then pull more
          Promise.resolve().then(function () { loadMore(); });
        } else {
          rearmInfinite();
        }
      })
      .catch(function (err) {
        console.warn('[OkObserver] loadMore failed', err);
        rearmInfinite();
      })
      .finally(function () { state.loading = false; });
  }

  function ensureInfinite() {
    if (io || state.done) return;
    var sentinel = qs('#feedSentinel');
    if (!sentinel) return;
    io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (e.isIntersecting) loadMore();
      });
    }, { rootMargin: '1200px 0px 1200px 0px', threshold: 0.01 });
    io.observe(sentinel);
  }

  function rearmInfinite() {
    var sentinel = qs('#feedSentinel');
    if (!sentinel) return;
    if (!io) { ensureInfinite(); return; }
    try { io.unobserve(sentinel); } catch (e) {}
    io.observe(sentinel);
  }

  // ========= Render: Detail =========
  function renderPostDetail(id) {
    // save scroll position for return
    try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0)); } catch (e) {}

    var app = qs('#app');
    app.innerHTML = headerHTML() + '<main id="detail"><div class="post-body">Loading…</div></main>' + footerHTML();

    fetchPost(id).then(function (post) {
      var body = qs('.post-body');
      var titleHTML = (post.title && post.title.rendered) || 'Untitled';
      var contentHTML = (post.content && post.content.rendered) || '';

      // Featured image at top (contained)
      var imgBlock = '';
      var f = getFeatured(post);
      if (f) imgBlock = '<figure class="detail-hero"><img src="' + f + '" alt=""></figure>';

      body.innerHTML =
        '<h1 class="post-title">' + titleHTML + '</h1>' +
        '<div class="post-meta"><strong>Oklahoma Observer</strong> — ' + niceDate(post.date) + '</div>' +
        imgBlock +
        '<article class="post-body-html">' + contentHTML + '</article>' +
        '<div class="detail-actions"><a class="btn-back" href="' + ROUTES.HOME + '">← Back to Posts</a></div>';

      // After content mounts, normalize embeds (Vimeo/YouTube/Facebook blocks)
      guaranteeEmbedsVisible(body);
    }).catch(function () {
      qs('.post-body').textContent = 'Post not found.';
    });
  }

  // ========= Embeds visibility (non-destructive) =========
  function guaranteeEmbedsVisible(root) {
    root = root || document;
    // Make any iframes/embeds visible with a minimum height
    var style = document.createElement('style');
    style.textContent =
      'iframe,video,.wp-block-embed__wrapper,.wp-block-embed,.fb-video,.fb-post{display:block !important;visibility:visible !important;opacity:1 !important;max-width:100% !important;width:100% !important;min-height:360px !important;background:#0000 !important}';
    document.head.appendChild(style);
  }

  // ========= UI bits =========
  function headerHTML() {
    return '' +
      '<header class="topbar">' +
        '<div class="brand">' +
          '<img src="logo.png" alt="The Oklahoma Observer" class="brand-logo" />' +
          '<div class="brand-motto">To comfort the afflicted and afflict the comfortable</div>' +
        '</div>' +
        '<button class="hamburger" aria-label="menu" onclick="document.body.classList.toggle(\'menu-open\')">≡</button>' +
        '<nav class="mainnav"><a href="' + ROUTES.HOME + '">Posts</a><a href="#/about">About</a></nav>' +
      '</header>';
  }

  function footerHTML() {
    return '' +
      '<footer class="site-footer">' +
        '© 2025 The Oklahoma Observer • Build ' + BUILD +
      '</footer>';
  }

  // ========= Utils =========
  function strip(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  function niceDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return iso; }
  }

})();
/* 🔴 main.js — END OF FILE — Build 2025-11-10R3-infiniteFix1 */
