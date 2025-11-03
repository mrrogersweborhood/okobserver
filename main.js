/* 🟢 main.js */
(function () {
  'use strict';

  // ---- Config / Constants ----
  const APP_VERSION = '2025-11-03R1';
  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PAGE_SIZE = 12;
  const MAX_CARDS = 60; // ~2–3 screens worth, keeps DOM light
  const IMG_BREAKPOINTS = [480, 768, 1024]; // responsive widths

  // ---- State ----
  let page = 1;
  let loading = false;
  let reachedEnd = false;
  let route = 'home'; // 'home' | 'about' | 'settings' | 'detail'
  const cachePages = new Map(); // page -> posts[]
  const lruKeys = [];

  // ---- DOM ----
  const app = document.getElementById('app');
  const sentinel = document.getElementById('sentinel');
  const menu = document.getElementById('menu');
  const hamburger = document.getElementById('hamburger');

  // ---- Utilities ----
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return ''; }
  };

  const isCartoon = (post) => {
    // Replace with your existing cartoon filter logic if different.
    const title = (post.title?.rendered || '').toLowerCase();
    const cats = (post.categories || []).join(',');
    return title.includes('cartoon') || /cartoon/i.test(cats);
  };

  const byline = (post) => {
    const authorName = post._embedded?.author?.[0]?.name || 'Staff';
    const date = fmtDate(post.date);
    return `${authorName} · ${date}`;
  };

  const getFeaturedId = (post) => post.featured_media || post.featured_media_id || null;

  // Build responsive <img> HTML with cache-busting per post
  const buildImgHtml = (mediaId, postId) => {
    if (!mediaId) return '';
    const src = `${API_BASE}/media/${mediaId}?cb=${postId}&w=${IMG_BREAKPOINTS[0]}`;
    const srcset = IMG_BREAKPOINTS.map(w => `${API_BASE}/media/${mediaId}?cb=${postId}&w=${w} ${w}w`).join(', ');
    const sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 45vw, 30vw';
    return `
      <img
        class="oo-card__img"
        src="${src}"
        srcset="${srcset}"
        sizes="${sizes}"
        decoding="async"
        loading="lazy"
        alt=""
      />
    `;
  };

  const escapeHTML = (s='') => s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  const excerptHtml = (post) => {
    // Immediate excerpt (no lazy mount)
    const ex = post.excerpt?.rendered || '';
    return `<div class="oo-card__excerpt">${ex}</div>`;
  };

  // Simple LRU for page JSON (keeps backscroll snappy without DOM bloat)
  const rememberPage = (p, posts) => {
    if (cachePages.has(p)) {
      // refresh position
      const idx = lruKeys.indexOf(p);
      if (idx > -1) lruKeys.splice(idx, 1);
    }
    cachePages.set(p, posts);
    lruKeys.push(p);
    while (lruKeys.length > 6) { // ~6 pages of JSON
      const k = lruKeys.shift();
      cachePages.delete(k);
    }
  };

  const removeOldCards = () => {
    const container = document.getElementById('oo-feed');
    if (!container) return;
    while (container.children.length > MAX_CARDS) {
      container.removeChild(container.firstElementChild);
    }
  };

  // ---- Rendering ----
  const ensureFeed = () => {
    let feed = document.getElementById('oo-feed');
    if (!feed) {
      feed = document.createElement('div');
      feed.id = 'oo-feed';
      feed.className = 'oo-grid';
      app.innerHTML = '';
      app.appendChild(feed);
    }
    return feed;
  };

  const cardHtml = (post) => {
    const postId = post.id;
    const title = post.title?.rendered || '';
    const mediaId = getFeaturedId(post);
    const img = buildImgHtml(mediaId, postId);
    const line = escapeHTML(byline(post));
    return `
      <article class="oo-card" data-id="${postId}">
        <a class="oo-card__link" href="#/post/${postId}" aria-label="Open post">
          <div class="oo-card__imageWrap">${img}</div>
          <h2 class="oo-card__title">${title}</h2>
          <div class="oo-card__byline">${line}</div>
          ${excerptHtml(post)}
        </a>
      </article>
    `;
  };

  const renderPostsPage = (posts) => {
    const feed = ensureFeed();
    // Batch DOM write
    const html = posts.map(cardHtml).join('');
    feed.insertAdjacentHTML('beforeend', html);
    removeOldCards();
  };

  const renderAbout = () => {
    app.innerHTML = `
      <section class="oo-about">
        <h1>About The Oklahoma Observer</h1>
        <p>Independent journalism since 1969. Tips: <a href="mailto:okobserver@outlook.com">okobserver@outlook.com</a></p>
      </section>
    `;
  };

  const renderSettings = () => {
    app.innerHTML = `
      <section class="oo-settings">
        <h1>Settings</h1>
        <p>Performance build <strong>${APP_VERSION}</strong></p>
      </section>
    `;
  };

  const renderDetail = async (id) => {
    app.innerHTML = `<div class="oo-detail--loading">Loading…</div>`;
    try {
      const res = await fetch(`${API_BASE}/posts/${id}`);
      const post = await res.json();

      // Featured image for detail
      const mediaId = getFeaturedId(post);
      const img = buildImgHtml(mediaId, id);

      const title = post.title?.rendered || '';
      const content = post.content?.rendered || '';
      const line = escapeHTML(byline(post));

      app.innerHTML = `
        <article class="oo-detail">
          <h1 class="oo-detail__title">${title}</h1>
          <div class="oo-detail__byline">${line}</div>
          <div class="oo-detail__imageWrap">${img}</div>
          <div class="oo-detail__content">${content}</div>
          <div class="oo-detail__back">
            <a class="oo-backBtn" href="#/">Back to Posts</a>
          </div>
        </article>
      `;
    } catch (e) {
      app.innerHTML = `<div class="oo-error">Failed to load post.</div>`;
    }
  };

  // ---- Data ----
  const fetchPosts = async (pageNum) => {
    const url = `${API_BASE}/posts?per_page=${PAGE_SIZE}&page=${pageNum}&_embed=1`;
    const r = await fetch(url);
    if (!r.ok) {
      if (r.status === 400 || r.status === 404) reachedEnd = true;
      throw new Error(`HTTP ${r.status}`);
    }
    const posts = await r.json();
    // Filter out cartoons permanently
    const filtered = posts.filter(p => !isCartoon(p));
    return filtered;
  };

  const loadNextPage = async () => {
    if (loading || reachedEnd || route !== 'home') return;
    loading = true;
    try {
      const posts = await fetchPosts(page);
      if (!posts.length) {
        reachedEnd = true;
        return;
      }
      rememberPage(page, posts);
      renderPostsPage(posts);
      page += 1;
    } catch (_) {
      // swallow; sentinel will try again if user scrolls
    } finally {
      loading = false;
    }
  };

  // ---- Router (hash-based) ----
  const router = async () => {
    const hash = location.hash || '#/';
    const parts = hash.slice(2).split('/');
    switch (parts[0]) {
      case '':
      case 'posts':
        route = 'home';
        ensureFeed();
        break;
      case 'about':
        route = 'about';
        renderAbout();
        return;
      case 'settings':
        route = 'settings';
        renderSettings();
        return;
      case 'post':
        route = 'detail';
        await renderDetail(parts[1]);
        return;
      default:
        route = 'home';
        ensureFeed();
        break;
    }
  };

  // ---- Infinite Scroll ----
  const io = new IntersectionObserver(async (entries) => {
    const first = entries[0];
    if (!first.isIntersecting) return;
    if (loading) return;
    await loadNextPage();
  }, { rootMargin: '1200px 0px 800px 0px', threshold: 0 });

  // ---- MutationObserver grid enforcer (throttled) ----
  const gridTarget = document.body;
  let rafToken = null;
  const mo = new MutationObserver(() => {
    if (rafToken) return;
    rafToken = requestAnimationFrame(() => {
      rafToken = null;
      const feed = document.getElementById('oo-feed');
      if (!feed) return;
      // Ensure the grid class is present; avoid heavy recalcs here.
      if (!feed.classList.contains('oo-grid')) {
        feed.classList.add('oo-grid');
      }
    });
  });

  // ---- Menu toggle ----
  const toggleMenu = () => {
    const open = menu.hasAttribute('hidden') ? false : true;
    if (open) {
      menu.setAttribute('hidden', '');
      hamburger.setAttribute('aria-expanded', 'false');
    } else {
      menu.removeAttribute('hidden');
      hamburger.setAttribute('aria-expanded', 'true');
    }
  };

  // ---- Init ----
  const start = async () => {
    window.addEventListener('hashchange', router);
    hamburger?.addEventListener('click', toggleMenu);

    await router(); // set initial route

    if (route === 'home') {
      io.observe(sentinel);
      await loadNextPage(); // load first page
    }

    // MutationObserver: keep it light
    mo.observe(gridTarget, { childList: true, subtree: true, attributes: true });
  };

  // Kick off
  start();

  // Debug banner (optional)
  try {
    console.info('[OkObserver] Performance build', APP_VERSION);
  } catch {}
})();
 /* 🔴 main.js */
