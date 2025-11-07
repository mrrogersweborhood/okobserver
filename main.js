/*
 OkObserver SPA Main Script
 Build 2025-11-07SR1-perfSWR1-videoR1-fbHotfix1b
 Proxy: https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/
 Notes:
 - Single fetch per page
 - Session scroll/return caching
 - Cartoon filter
 - Full excerpts
 - Featured images contained
 - Click-to-play for YouTube, Vimeo, Facebook, MP4
 - Grid MutationObserver enforcement
 - No ES modules
*/

(function () {
  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
  const app = document.getElementById('app');
  const scrollCacheKey = 'okobs-scroll';
  const listCacheKey = 'okobs-list';
  const VER = '2025-11-07SR1-perfSWR1-videoR1-fbHotfix1b';

  console.log('[OkObserver] Init', VER);

  // Utils
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const qs = (sel, ctx = document) => ctx.querySelector(sel);
  const fetchJSON = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); };

  // Decode entities for titles used in document.title
  const decodeEntities = (s) => {
    if (!s) return s;
    const d = document.createElement('textarea');
    d.innerHTML = s;
    return d.value;
  };

  // Home
  async function renderHome() {
    document.title = 'The Oklahoma Observer';
    app.innerHTML = '<div id="grid" class="okobs-grid"></div>';
    const grid = qs('#grid');
    const cached = sessionStorage.getItem(listCacheKey);
    if (cached) {
      grid.innerHTML = cached;
      restoreScroll();
      return;
    }
    const posts = await fetchJSON(API_BASE + 'posts?per_page=20&_embed');
    posts
      .filter(p => !p.categories.includes(5923)) // cartoon category id
      .forEach(p => grid.appendChild(buildCard(p)));
    sessionStorage.setItem(listCacheKey, grid.innerHTML);
  }

  function buildCard(p) {
    const card = el('article', 'post-card');
    const link = el('a');
    link.href = '#/post/' + p.id;

    const img = p._embedded?.['wp:featuredmedia']?.[0]?.source_url;
    if (img) {
      const pic = el('img');
      pic.src = img + '?cb=' + p.id;
      pic.alt = p.title.rendered;
      pic.loading = 'lazy';
      card.appendChild(pic);
    }

    const title = el('h2', 'post-title', p.title.rendered);
    const by = el('div', 'post-meta',
      'Oklahoma Observer — ' + new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    );
    const excerpt = el('div', 'post-excerpt', p.excerpt.rendered);

    link.appendChild(title);
    card.appendChild(link);
    card.appendChild(by);
    card.appendChild(excerpt);
    return card;
  }

  // Detail
  async function renderPost(id) {
    const p = await fetchJSON(API_BASE + 'posts/' + id + '?_embed');

    const hero = p._embedded?.['wp:featuredmedia']?.[0]?.source_url;

    document.title = decodeEntities(p.title.rendered) + ' - The Oklahoma Observer';

    const container = el('article', 'post-detail');

    if (hero) {
      const fig = el('figure', 'post-hero');
      const img = el('img');
      img.src = hero + '?cb=' + p.id;
      img.alt = decodeEntities(p.title.rendered);
      fig.appendChild(img);
      container.appendChild(fig);
    }

    container.appendChild(el('h1', 'post-title', p.title.rendered));
    container.appendChild(el('div', 'post-meta',
      'Oklahoma Observer — ' + new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    ));

    const body = el('div', 'post-body', p.content.rendered);
    container.appendChild(body);

    const back = el('button', 'back-btn', '← Back to Posts');
    back.addEventListener('click', () => { location.hash = '#/'; });
    container.appendChild(back);

    app.innerHTML = '';
    app.appendChild(container);

    // Enhance any embeds/links recognized as video
    enhanceVideos(body);
  }

  // Video enhancement (YT, Vimeo, FB, MP4)
  function enhanceVideos(scope) {
    const nodes = Array.from(scope.querySelectorAll('iframe, video, a[href]'));
    nodes.forEach(elm => {
      const src = elm.src || elm.href || '';
      if (!src) return;

      let type = '';
      if (/youtube\.com|youtu\.be/.test(src)) type = 'youtube';
      else if (/vimeo\.com/.test(src)) type = 'vimeo';
      else if (/facebook\.com|fb\.watch/.test(src)) type = 'facebook';
      else if (/\.(mp4|webm|ogg)$/i.test(src)) type = 'mp4';
      if (!type) return;

      if (elm.tagName === 'A') elm.removeAttribute('href');

      const wrap = document.createElement('div');
      wrap.className = 'okobs-video pending ' + type;
      wrap.style.position = 'relative';
      wrap.style.cursor = 'pointer';
      wrap.style.aspectRatio = '16/9';
      wrap.style.background = '#000';

      const btn = el('div', 'play-overlay');
      btn.innerHTML = '<div class="triangle"></div>';
      const poster = el('img');
      const hero = qs('.post-hero img');
      if (hero) poster.src = hero.currentSrc || hero.src;
      poster.alt = 'Play video';
      poster.style.width = '100%';
      poster.style.height = '100%';
      poster.style.objectFit = 'cover';

      wrap.appendChild(poster);
      wrap.appendChild(btn);

      wrap.addEventListener('click', () => {
        if (type === 'mp4') {
          const v = document.createElement('video');
          v.src = src;
          v.controls = true;
          v.autoplay = true;
          wrap.replaceChildren(v);
          wrap.classList.remove('pending');
          return;
        }
        const iframe = document.createElement('iframe');
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.frameBorder = '0';
        iframe.width = '100%';
        iframe.height = '100%';
        if (type === 'youtube') iframe.src = src.replace('watch?v=', 'embed/') + '?autoplay=1';
        else if (type === 'vimeo') iframe.src = src.replace('vimeo.com', 'player.vimeo.com/video') + '?autoplay=1';
        else if (type === 'facebook')
          iframe.src = 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(src) + '&autoplay=1&show_text=false';
        wrap.replaceChildren(iframe);
        wrap.classList.remove('pending');
      });

      elm.replaceWith(wrap);
    });
  }

  // Router
  async function router() {
    const hash = location.hash;
    if (hash.startsWith('#/post/')) {
      const id = hash.split('/')[2];
      saveScroll();
      await renderPost(id);
    } else {
      await renderHome();
    }
  }

  // Scroll caching
  function saveScroll() { sessionStorage.setItem(scrollCacheKey, window.scrollY); }
  function restoreScroll() {
    const y = sessionStorage.getItem(scrollCacheKey);
    if (y != null) window.scrollTo(0, parseFloat(y));
  }

  // Grid enforcement (MutationObserver)
  const observer = new MutationObserver(() => {
    const grid = qs('#grid');
    if (grid) grid.classList.add('okobs-grid');
  });
  observer.observe(app, { childList: true, subtree: true });

  window.addEventListener('hashchange', router);
  router();
})();

/* =========================================================
   Facebook plain-link → click-to-play embed HOTFIX
   (Handles facebook.com/.../videos/... and fb.watch/...)
   ========================================================= */
(function () {
  if (!location.hash.startsWith('#/post/')) return;

  const wait = (sel, timeout = 4000) =>
    new Promise((resolve) => {
      const el = document.querySelector(sel);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const e2 = document.querySelector(sel);
        if (e2) { obs.disconnect(); resolve(e2); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
    });

  const isFbVideo = (href) => {
    if (!href) return false;
    try {
      const u = new URL(href);
      const h = u.hostname.replace(/^www\./, '');
      return ((h === 'facebook.com' || h === 'm.facebook.com' || h === 'fb.watch') &&
              (/\/videos?\//.test(u.pathname) || h === 'fb.watch'));
    } catch { return false; }
  };

  const makeFbIframeSrc = (href, autoplay = 1) =>
    `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&autoplay=${autoplay}&show_text=false&width=1280`;

  const buildPoster = (aEl, posterUrl) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'okobs-video fb-video pending';
    wrapper.style.position = 'relative';
    wrapper.style.cursor = 'pointer';
    wrapper.style.maxWidth = '100%';
    wrapper.style.aspectRatio = '16/9';
    wrapper.style.background = '#000';

    const img = document.createElement('img');
    img.alt = 'Play video';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    if (posterUrl) img.src = posterUrl;

    const overlay = document.createElement('div');
    overlay.setAttribute('aria-label', 'Play video');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.display = 'grid';
    overlay.style.placeItems = 'center';

    const btn = document.createElement('div');
    btn.style.width = '84px';
    btn.style.height = '84px';
    btn.style.borderRadius = '999px';
    btn.style.background = 'rgba(30,144,255,.92)';
    btn.style.boxShadow = '0 8px 24px rgba(0,0,0,.3)';
    btn.style.display = 'grid';
    btn.style.placeItems = 'center';

    const tri = document.createElement('div');
    tri.style.width = '0';
    tri.style.height = '0';
    tri.style.borderLeft = '22px solid white';
    tri.style.borderTop = '14px solid transparent';
    tri.style.borderBottom = '14px solid transparent';
    tri.style.marginLeft = '6px';

    btn.appendChild(tri);
    overlay.appendChild(btn);

    wrapper.appendChild(img);
    wrapper.appendChild(overlay);

    wrapper.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = makeFbIframeSrc(aEl.href, 1);
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.style.border = '0';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      wrapper.replaceChildren(iframe);
      wrapper.classList.remove('pending');
    });

    return wrapper;
  };

  (async () => {
    const body = await wait('.post-detail, .post-body, main article, #detail');
    if (!body) return;

    const anchors = Array.from(body.querySelectorAll('a[href]')).filter(a => isFbVideo(a.href));
    if (!anchors.length) return;

    const heroImg = body.querySelector('.post-hero img, .post-featured img, figure img, .detail-hero img, .post-detail img');
    const posterUrl = heroImg ? (heroImg.currentSrc || heroImg.src) : '';

    anchors.forEach((a) => {
      if (a.dataset.fbConverted === '1') return;
      a.dataset.fbConverted = '1';
      const poster = buildPoster(a, posterUrl);
      const parent = a.parentElement;
      const container =
        parent && parent.childElementCount === 1 && parent.textContent.trim() === a.textContent.trim()
          ? parent
          : a;
      container.replaceWith(poster);
    });
  })();
})();
