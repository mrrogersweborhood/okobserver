/*
 OkObserver SPA Main Script
 Build: 2025-11-07SR1-perfSWR1-videoR1
 Proxy: https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/
 Notes:
 - Single fetch per page
 - Session scroll + return-to-position
 - Cartoon posts filtered out
 - Excerpts immediate (no lazy-mount)
 - Featured images contained, edge-to-edge hero on detail
 - Click-to-play: YouTube, Vimeo, Facebook (embeds), MP4
 - Grid MutationObserver enforcement
 - No ES modules
*/

(function () {
  var API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
  var app = document.getElementById('app');
  var scrollCacheKey = 'okobs-scroll';
  var listCacheKey = 'okobs-list';
  var VER = '2025-11-07SR1-perfSWR1-videoR1';

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

  // ---------- home ----------
  function buildCard(p) {
    var card = el('article', 'post-card');
    var link = el('a');
    link.href = '#/post/' + p.id;

    var img = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0] && p._embedded['wp:featuredmedia'][0].source_url;
    if (img) {
      var pic = el('img');
      pic.src = img + '?cb=' + p.id;
      pic.alt = p.title.rendered;
      pic.loading = 'lazy';
      card.appendChild(pic);
    }

    var title = el('h2', 'post-title', p.title.rendered);
    var by = el('div', 'post-meta',
      'Oklahoma Observer — ' + new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    );
    var excerpt = el('div', 'post-excerpt', p.excerpt.rendered);

    link.appendChild(title);
    card.appendChild(link);
    card.appendChild(by);
    card.appendChild(excerpt);
    return card;
  }

  function renderHome() {
    console.log('[OkObserver] Render home');
    document.title = 'The Oklahoma Observer';
    app.innerHTML = '<div id="grid" class="okobs-grid"></div>';
    var grid = qs('#grid');

    // session list cache (restores immediately, then we re-render on next nav)
    var cached = sessionStorage.getItem(listCacheKey);
    if (cached) {
      grid.innerHTML = cached;
      restoreScroll();
      return Promise.resolve();
    }

    return fetchJSON(API_BASE + 'posts?per_page=20&_embed').then(function(posts) {
      // cartoon category hard filter — 5923 must remain excluded
      posts.filter(function (p) { return !(p.categories || []).includes(5923); })
           .forEach(function (p) { grid.appendChild(buildCard(p)); });
      sessionStorage.setItem(listCacheKey, grid.innerHTML);
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

      // Enhance embedded videos (click-to-play)
      enhanceVideos(body);

      var back = el('button', 'back-btn', '← Back to Posts');
      back.addEventListener('click', function () { location.hash = '#/'; });
      container.appendChild(back);

      app.innerHTML = '';
      app.appendChild(container);
    });
  }

  // ---------- video enhancement ----------
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

      // For anchors, disable navigation to keep in-page click-to-play
      if (elm.tagName === 'A') elm.removeAttribute('href');

      var wrap = document.createElement('div');
      wrap.className = 'okobs-video pending ' + type;
      wrap.style.position = 'relative';
      wrap.style.cursor = 'pointer';
      wrap.style.aspectRatio = '16/9';
      wrap.style.background = '#000';

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
        iframe.frameBorder = '0';
        iframe.width = '100%';
        iframe.height = '100%';
        if (type === 'youtube') iframe.src = src.replace('watch?v=', 'embed/') + '?autoplay=1';
        else if (type === 'vimeo') iframe.src = src.replace('vimeo.com', 'player.vimeo.com/video') + '?autoplay=1';
        else if (type === 'facebook') iframe.src = 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(src) + '&autoplay=1&show_text=false';
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
