/* 🟢 main.js — 2025-11-03R1g */
(function () {
  'use strict';
  window.AppVersion = '2025-11-03R1g';
  console.log('[OkObserver] main.js', window.AppVersion);

  const API_BASE  = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PAGE_SIZE = 12;
  const MAX_CARDS = 60;

  let page = 1, loading = false, reachedEnd = false, route = 'home';
  const cachePages = new Map(), lru = [];

  const app       = document.getElementById('app');
  const sentinel  = document.getElementById('sentinel');
  const menu      = document.getElementById('menu');
  const hamburger = document.getElementById('hamburger');

  // ---------- utils ----------
  const fmtDate = iso => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
    } catch { return ''; }
  };
  const byline = p => `${p._embedded?.author?.[0]?.name || 'Staff'} · ${fmtDate(p.date)}`;

  /* Bullet-proof cartoon filter: title + any embedded terms (categories/tags) */
  const isCartoon = (post) => {
    const title = (post?.title?.rendered || '').toLowerCase();
    if (/\bcartoon(s)?\b/.test(title)) return true;

    const termGroups = post?._embedded?.['wp:term'] || [];
    const terms = termGroups.flat().filter(Boolean);
    for (const t of terms) {
      const name = (t?.name || '').toLowerCase();
      const slug = (t?.slug || '').toLowerCase();
      if (name.includes('cartoon') || slug.includes('cartoon')) return true;
    }
    return false;
  };

  // Featured image source URL from _embedded media
  const featuredSrc = (post) => {
    const fm = post?._embedded?.['wp:featuredmedia']?.[0];
    if (!fm) return '';
    const sz = fm.media_details?.sizes;
    const pick =
      sz?.medium_large?.source_url ||
      sz?.large?.source_url ||
      sz?.medium?.source_url ||
      fm.source_url ||
      fm.guid?.rendered ||
      '';
    return pick ? `${pick}${pick.includes('?') ? '&' : '?'}cb=${post.id}` : '';
  };

  const imgHTML = (post) => {
    const src = featuredSrc(post);
    if (!src) return '';
    return `<img src="${src}" alt="" decoding="async" loading="lazy"
              style="width:100%;height:auto;display:block;border:0;background:#fff;">`;
  };

  // ---------- VIDEO helpers ----------
  // Extract first playable embed from post content
  const extractVideo = (html = '') => {
    // YouTube (watch or youtu.be)
    const yt = html.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})|https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/i);
    if (yt) {
      const id = (yt[1] || yt[2]);
      return { type: 'youtube', src: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` };
    }
    // Vimeo
    const vimeo = html.match(/https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i);
    if (vimeo) {
      const id = vimeo[1];
      return { type: 'vimeo', src: `https://player.vimeo.com/video/${id}?autoplay=1` };
    }
    // Native <video> tag
    const vidTag = html.match(/<video[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (vidTag) return { type: 'video', src: vidTag[1] };
    return null;
  };

  // Poster + play overlay; falls back to plain poster if no video present
  const posterWithPlay = (post, contentHTML) => {
    const poster = imgHTML(post);
    const playable = extractVideo(contentHTML);
    if (!playable) return poster;

    const label = 'Play video';
    return `
      <div class="thumb" data-has-video="1" data-src="${encodeURIComponent(playable.src)}" data-type="${playable.type}" style="position:relative;">
        ${poster}
        <button class="oo-play" aria-label="${label}" title="${label}"
          style="
            position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
            width:56px;height:56px;border:0;border-radius:50%;
            background:rgba(30,144,255,.92);color:#fff;font-size:0;cursor:pointer;
            box-shadow:0 2px 8px rgba(0,0,0,.25);
          ">
          <span aria-hidden="true" style="
            display:block;margin:0 auto;border-style:solid;
            border-width:12px 0 12px 20px;border-color:transparent transparent transparent #fff;width:0;height:0;
          "></span>
        </button>
      </div>
    `;
  };

  // Replace poster with iframe/video on click
  const wirePlayHandlers = (rootEl) => {
    rootEl.querySelectorAll('.thumb[data-has-video="1"] .oo-play').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const wrap = btn.closest('.thumb');
        const type = wrap?.dataset?.type;
        const src  = decodeURIComponent(wrap?.dataset?.src || '');
        if (!wrap || !src) return;

        // clear poster
        wrap.innerHTML = '';
        wrap.style.position = 'relative';

        if (type === 'video') {
          const v = document.createElement('video');
          v.src = src; v.controls = true; v.autoplay = true; v.playsInline = true;
          v.style.width = '100%'; v.style.height = 'auto'; v.style.display = 'block';
          wrap.appendChild(v);
        } else {
          const iframe = document.createElement('iframe');
          iframe.src = src;
          iframe.allow = 'autoplay; fullscreen; picture-in-picture';
          iframe.frameBorder = '0';
          iframe.referrerPolicy = 'no-referrer-when-downgrade';
          iframe.style.width = '100%';
          iframe.style.height = '315px';
          iframe.style.display = 'block';
          wrap.appendChild(iframe);
        }
      }, { once: true });
    });
  };

  // ---------- state helpers ----------
  const remember = (k, v) => {
    if (cachePages.has(k)) {
      const i = lru.indexOf(k);
      if (i > -1) lru.splice(i, 1);
    }
    cachePages.set(k, v);
    lru.push(k);
    while (lru.length > 6) cachePages.delete(lru.shift());
  };

  const ensureFeed = () => {
    let feed = document.querySelector('.posts-grid');
    if (!feed) {
      feed = document.createElement('div');
      feed.className = 'posts-grid';
      app.innerHTML = '';
      app.appendChild(feed);
    }
    return feed;
  };

  const trimCards = () => {
    const c = document.querySelector('.posts-grid');
    if (!c) return;
    while (c.children.length > MAX_CARDS) c.removeChild(c.firstElementChild);
  };

  // ---------- rendering ----------
  const cardHTML = p => `
    <article class="post-card" data-id="${p.id}">
      <a class="title-link" href="#/post/${p.id}">
        ${posterWithPlay(p, p.content?.rendered || '')}
        <h2 class="post-title">${p.title?.rendered || ''}</h2>
        <div class="byline">${byline(p)}</div>
        <div class="post-summary">${p.excerpt?.rendered || ''}</div>
      </a>
    </article>`;

  const renderPage = posts => {
    const feed = ensureFeed();
    feed.insertAdjacentHTML('beforeend', posts.map(cardHTML).join(''));
    wirePlayHandlers(feed);
    trimCards();
  };

  const renderAbout = () => {
    app.innerHTML = `<section><h1>About The Oklahoma Observer</h1>
      <p>Independent journalism since 1969. Tips:
        <a href="mailto:okobserver@outlook.com">okobserver@outlook.com</a></p>
    </section>`;
  };

  const renderSettings = () => {
    app.innerHTML = `<section><h1>Settings</h1>
      <p>Build <strong>${window.AppVersion}</strong></p>
    </section>`;
  };

  const renderDetail = async (id) => {
    app.innerHTML = `<div>Loading…</div>`;
    try {
      const r = await fetch(`${API_BASE}/posts/${id}?_embed=1`);
      const p = await r.json();
      app.innerHTML = `
        <article>
          <h1>${p.title?.rendered || ''}</h1>
          <div class="byline">${byline(p)}</div>
          <div class="post-hero">
            ${posterWithPlay(p, p.content?.rendered || '')}
          </div>
          <div>${p.content?.rendered || ''}</div>
          <p><a class="button" href="#/">Back to Posts</a></p>
        </article>`;
      wirePlayHandlers(app);
    } catch {
      app.innerHTML = `<div>Failed to load post.</div>`;
    }
  };

  // ---------- data ----------
  const fetchPosts = async (n) => {
    const r = await fetch(`${API_BASE}/posts?per_page=${PAGE_SIZE}&page=${n}&_embed=1`);
    if (!r.ok) { if (r.status === 400 || r.status === 404) reachedEnd = true; throw new Error(r.status); }
    const posts = await r.json();
    return posts.filter(p => !isCartoon(p));
  };

  const loadNext = async () => {
    if (loading || reachedEnd || route !== 'home') return;
    loading = true;
    try {
      const posts = await fetchPosts(page);
      if (!posts.length) { reachedEnd = true; return; }
      remember(page, posts);
      renderPage(posts);
      page += 1;
    } finally { loading = false; }
  };

  // ---------- router ----------
  const router = async () => {
    const parts = (location.hash || '#/').slice(2).split('/');
    switch (parts[0]) {
      case '': case 'posts': route = 'home'; ensureFeed(); break;
      case 'about':         route = 'about';   return renderAbout();
      case 'settings':      route = 'settings';return renderSettings();
      case 'post':          route = 'detail';  return renderDetail(parts[1]);
      default:              route = 'home';    ensureFeed(); break;
    }
  };

  // ---------- infinite scroll ----------
  const io = new IntersectionObserver(async (entries) => {
    if (!entries[0].isIntersecting || loading) return;
    await loadNext();
  }, { rootMargin: '1200px 0px 800px 0px', threshold: 0 });

  // ---------- menu ----------
  const toggleMenu = () => {
    const open = !menu.hasAttribute('hidden');
    if (open) { menu.setAttribute('hidden',''); hamburger.setAttribute('aria-expanded','false'); }
    else { menu.removeAttribute('hidden'); hamburger.setAttribute('aria-expanded','true'); }
  };

  // ---------- init ----------
  const start = async () => {
    addEventListener('hashchange', router);
    hamburger?.addEventListener('click', toggleMenu);

    await router();
    if (route === 'home') { io.observe(sentinel); await loadNext(); }
  };

  start();
})();
 /* 🔴 main.js */
