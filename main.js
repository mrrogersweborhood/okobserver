/*
 OkObserver SPA Main Script
 Build: 2025-11-07SR1-perfSWR1-videoR1-fbFix2
 Proxy: https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/
 Features kept:
 - Infinite scroll (paginated) with duplicate guard
 - Single fetch at a time
 - Session list & scroll cache
 - Cartoon filter (ID 5923 + term/title 'cartoon')
 - Excerpts immediate
 - Clickable card image (image wrapped by <a>)
 - Edge-to-edge hero on detail
 - Click-to-play: YouTube, Vimeo, Facebook, MP4 (Facebook fixed)
 - Grid MutationObserver enforcement
 - No ES modules
*/

(function () {
  var API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
  var app = document.getElementById('app');
  var scrollCacheKey = 'okobs-scroll';
  var listCacheKey = 'okobs-list';
  var metaCacheKey = 'okobs-list-meta';
  var VER = '2025-11-07SR1-perfSWR1-videoR1-fbFix2';

  console.log('[OkObserver] Init', VER);

  // ---------- utils ----------
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function fetchJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  function decodeEntities(s) {
    if (!s) return s;
    var d = document.createElement('textarea');
    d.innerHTML = s;
    return d.value;
  }

  // Robust cartoon filter
  function isCartoon(p) {
    try {
      if ((p.categories || []).includes(5923)) return true;
      var terms = [];
      if (p._embedded && p._embedded['wp:term']) {
        p._embedded['wp:term'].forEach(function(arr){ if (Array.isArray(arr)) terms = terms.concat(arr); });
      }
      var hasCartoonTerm = terms.some(function(t){
        var slug = (t && t.slug || '').toLowerCase();
        var name = (t && t.name || '').toLowerCase();
        return slug.includes('cartoon') || name.includes('cartoon');
      });
      if (hasCartoonTerm) return true;
      var title = (p.title && p.title.rendered || '').toLowerCase();
      return title.includes('cartoon');
    } catch(e){ return false; }
  }

  // ---------- home (infinite scroll) ----------
  var loading = false, done = false, page = 1, perPage = 12;
  var seenIds = new Set();

  function buildCard(p) {
    var card = el('article', 'post-card');
    var link = el('a');
    link.href = '#/post/' + p.id;

    var imgUrl = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0] && p._embedded['wp:featuredmedia'][0].source_url;
    if (imgUrl) {
      var pic = el('img');
      pic.src = imgUrl + '?cb=' + p.id;
      pic.alt = p.title.rendered;
      pic.loading = 'lazy';
      link.appendChild(pic);
    }

    var title = el('h2', 'post-title', p.title.rendered);
    link.appendChild(title);
    card.appendChild(link);

    var by = el('div', 'post-meta',
      'Oklahoma Observer — ' + new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    );
    var excerpt = el('div', 'post-excerpt', p.excerpt.rendered);
    card.appendChild(by);
    card.appendChild(excerpt);
    return card;
  }

  function sliderBottomDistance() {
    return document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
  }

  function saveListCache(grid) {
    try {
      sessionStorage.setItem(listCacheKey, grid.innerHTML);
      sessionStorage.setItem(metaCacheKey, JSON.stringify({
        page: page, done: done, seen: Array.from(seenIds)
      }));
    } catch (_) {}
  }

  function restoreListCache(grid) {
    var html = sessionStorage.getItem(listCacheKey);
    var meta = sessionStorage.getItem(metaCacheKey);
    if (!html || !meta) return false;
    grid.innerHTML = html;
    try {
      var m = JSON.parse(meta);
      page = m.page || 1;
      done = !!m.done;
      (m.seen || []).forEach(function(id){ seenIds.add(id); });
    } catch(_) {}
    return true;
  }

  function attachScroll(grid) {
    function onScroll() {
      if (done || loading) return;
      if (sliderBottomDistance() > 800) return;
      loadMore(grid);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function loadMore(grid) {
    if (loading || done) return;
    loading = true;
    var url = API_BASE + 'posts?per_page=' + perPage + '&page=' + page + '&_embed';
    fetchJSON(url).then(function(posts) {
      if (!posts || !posts.length) { done = true; return; }
      posts.forEach(function(p) {
        if (isCartoon(p)) return;
        if (seenIds.has(p.id)) return;
        seenIds.add(p.id);
        grid.appendChild(buildCard(p));
      });
      page++;
      saveListCache(grid);
    }).catch(function(e){
      console.warn('[OkObserver] loadMore failed', e);
    }).finally(function(){ loading = false; });
  }

  function resetHomeState() {
    loading = false; done = false; page = 1; perPage = 12; seenIds = new Set();
  }

  function renderHome() {
    console.log('[OkObserver] Render home');
    resetHomeState();
    document.title = 'The Oklahoma Observer';
    app.innerHTML = '<div id="grid" class="okobs-grid"></div>';
    var grid = qs('#grid');

    if (restoreListCache(grid)) {
      restoreScroll();
      attachScroll(grid);
      if (sliderBottomDistance() <= 800) loadMore(grid);
      return Promise.resolve();
    }

    return fetchJSON(API_BASE + 'posts?per_page=' + perPage + '&page=' + page + '&_embed').then(function(posts) {
      posts.forEach(function(p) {
        if (isCartoon(p)) return;
        if (seenIds.has(p.id)) return;
        seenIds.add(p.id);
        grid.appendChild(buildCard(p));
      });
      page++;
      saveListCache(grid);
      attachScroll(grid);
      if (sliderBottomDistance() <= 800) loadMore(grid);
    });
  }

  // ---------- detail ----------
  function renderPost(id) {
    console.log('[OkObserver] Render post', id);
    return fetchJSON(API_BASE + 'posts/' + id + '?_embed').then(function (p) {
      var hero = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0] && p._embedded['wp:featuredmedia'][0].source_url;

      document.title = decodeEntities(p.title.rendered) + ' - The Oklahoma Observer';

      var container = el('article', 'post-detail');

      if (hero) {
        var fig = el('figure', 'post-hero');
        var img = el('img');
        img.src = hero + '?cb=' + p.id;
        img.alt = decodeEntities(p.title.rendered);
        fig.appendChild(img);
        container.appendChild(fig);
      }

      container.appendChild(el('h1', 'post-title', p.title.rendered));
      container.appendChild(el('div', 'post-meta',
        'Oklahoma Observer — ' + new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      ));

      var body = el('div', 'post-body', p.content.rendered);
      container.appendChild(body);

      enhanceVideos(body);

      var back = el('button', 'back-btn', '← Back to Posts');
      back.addEventListener('click', function () { location.hash = '#/'; });
      container.appendChild(back);

      app.innerHTML = '';
      app.appendChild(container);
    });
  }

  // ---------- video enhancement (Facebook fixed) ----------
  function enhanceVideos(scope) {
    var nodes = Array.prototype.slice.call(scope.querySelectorAll('iframe, video, a[href]'));
    nodes.forEach(function (elm) {
      var src = elm.src || elm.href || '';
      if (!src) return;

      var type = '';
      if (/youtube\.com|youtu\.be/.test(src)) type = 'youtube';
      else if (/vimeo\.com/.test(src)) type = 'vimeo';
      else if (/facebook\.com|fb\.watch/.test(src)) type = 'facebook';
      else if (/\.(mp4|webm|ogg)$/i.test(src)) type = 'mp4';
      if (!type) return;

      // For anchors, keep click-to-play behavior
      if (elm.tagName === 'A') elm.removeAttribute('href');

      var wrap = document.createElement('div');
      wrap.className = 'okobs-video pending ' + type;
      wrap.style.position = 'relative';
      wrap.style.cursor = 'pointer';
      wrap.style.aspectRatio = '16/9';
      wrap.style.background = '#000';
      wrap.style.maxWidth = '100%';
      wrap.style.borderRadius = '12px';
      wrap.style.overflow = 'hidden';

      var btn = el('div', 'play-overlay');
      btn.innerHTML = '<div class="triangle"></div>';

      var poster = el('img');
      var hero = qs('.post-hero img');
      if (hero) poster.src = hero.currentSrc || hero.src;
      poster.alt = 'Play video';
      poster.style.width = '100%';
      poster.style.height = '100%';
      poster.style.objectFit = 'cover';

      wrap.appendChild(poster);
      wrap.appendChild(btn);

      wrap.addEventListener('click', function () {
        if (type === 'mp4') {
          var v = document.createElement('video');
          v.src = src;
          v.controls = true;
          v.autoplay = true;
          wrap.replaceChildren(v);
          wrap.classList.remove('pending');
          return;
        }

        var iframe = document.createElement('iframe');
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.setAttribute('frameborder', '0');
        iframe.style.width = '100%';
        iframe.style.height = '100%';

        if (type === 'youtube') {
          iframe.src = src.replace('watch?v=', 'embed/') + '?autoplay=1';
        } else if (type === 'vimeo') {
          iframe.src = src.replace('vimeo.com', 'player.vimeo.com/video') + '?autoplay=1';
        } else if (type === 'facebook') {
          // Always convert to the official FB embed endpoint.
          // Works for plain post URLs and fb.watch short links.
          var plugin = 'https://www.facebook.com/plugins/video.php?href=' +
            encodeURIComponent(src) + '&autoplay=1&show_text=false&width=1280';
          iframe.src = plugin;
        }

        wrap.replaceChildren(iframe);
        wrap.classList.remove('pending');
      });

      elm.replaceWith(wrap);
    });
  }

  // ---------- router ----------
  function saveScroll() { sessionStorage.setItem(scrollCacheKey, String(window.scrollY || 0)); }
  function restoreScroll() {
    var y = sessionStorage.getItem(scrollCacheKey);
    if (y != null) window.scrollTo(0, parseFloat(y));
  }

  function router() {
    var hash = location.hash || '#/';
    if (hash.indexOf('#/post/') === 0) {
      var id = hash.split('/')[2];
      saveScroll();
      renderPost(id).catch(function (e) { console.error('[OkObserver] detail error', e); });
    } else {
      renderHome().catch(function (e) { console.error('[OkObserver] home error', e); });
    }
  }

  // ---------- grid enforcement ----------
  var observer = new MutationObserver(function () {
    var grid = qs('#grid');
    if (grid) grid.classList.add('okobs-grid');
  });
  observer.observe(app, { childList: true, subtree: true });

  window.addEventListener('hashchange', router);
  router();
})();
