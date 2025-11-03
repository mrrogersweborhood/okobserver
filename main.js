/* 🟢 main.js */
(function () {
  'use strict';

  const APP_VERSION = '2025-11-03R1b'; // class-name alignment hotfix
  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PAGE_SIZE = 12;
  const MAX_CARDS = 60;

  let page = 1;
  let loading = false;
  let reachedEnd = false;
  let route = 'home';
  const cachePages = new Map();
  const lruKeys = [];

  const app = document.getElementById('app');
  const sentinel = document.getElementById('sentinel');
  const menu = document.getElementById('menu');
  const hamburger = document.getElementById('hamburger');

  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return ''; }
  };

  const isCartoon = (post) => {
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

  // Baseline image URL (no &w=…), matches your proxy and CSS expectations
  const buildImgHtml = (mediaId, postId) => {
    if (!mediaId) return '';
    const src = `${API_BASE}/media/${mediaId}?cb=${postId}`;
    return `
      <img
        src="${src}"
        decoding="async"
        loading="lazy"
        alt=""
        style="width:100%;height:auto;display:block;border:0;background:#fff;"
      />
    `;
  };

  const escapeHTML = (s='') => s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  const excerptHtml = (post) => {
    const ex = post.excerpt?.rendered || '';
    return `<div class="post-summary">${ex}</div>`;
  };

  const rememberPage = (p, posts) => {
    if (cachePages.has(p)) {
      const idx = lruKeys.indexOf(p);
      if (idx > -1) lruKeys.splice(idx, 1);
    }
    cachePages.set(p, posts);
    lruKeys.push(p);
    while (lruKeys.length > 6) {
      const k = lruKeys.shift();
      cachePages.delete(k);
    }
  };

  const removeOldCards = () => {
    const container = document.querySelector('.posts-grid');
    if (!container) return;
    while (container.children.length > MAX_CARDS) {
      container.removeChild(container.firstElementChild);
    }
  };

  const ensureFeed = () => {
    let feed = document.querySelector('.posts-grid');
    if (!feed) {
      feed = document.createElement('div');
      feed.className = 'posts-grid'; // ← your CSS expects this
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
      <article class="post-card" data-id="${postId}">
        <a class="title-link" href="#/post/${postId}" aria-label="Open post">
          <div class="thumb">${img}</div>
          <h2 class="post-title">${title}</h2>
          <div class="byline">${line}</div>
          ${excerptHtml(post)}
        </a>
      </article>
    `;
  };

  const renderPostsPage = (posts) => {
    const feed = ensureFeed();
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
        <p>Build <strong>${APP_VERSION}</strong></p>
      </section>
    `;
  };

  const renderDetail = async (id) => {
    app.innerHTML = `<div class="oo-detail--loading">Loading…</div>`;
    try {
      const res = await fetch(`${API_BASE}/posts/${id}`);
      const post = await res.json();

      const mediaId = getFeaturedId(post);
      const img = buildImgHtml(mediaId, id);

      const title = post.title?.rendered || '';
      const content = post.content?.rendered || '';
      const line = escapeHTML(byline(post));

      app.innerHTML = `
        <article class="oo-detail">
          <h1 class="oo-detail__title">${title}</h1>
          <div class="oo-detail__byline">${line}</div>
          <div class="post-hero">${img}</div>
          <div class="oo-detail__content">${content}</div>
          <div class="oo-detail__back">
            <a class="button" href="#/">Back to Posts</a>
          </div>
        </article>
      `;
    } catch {
      app.innerHTML = `<div class="oo-error">Failed to load post.</div>`;
    }
  };

  const fetchPosts = async (pageNum) => {
    const url = `${API_BASE}/posts?per_page=${PAGE_SIZE}&page=${pageNum}&_embed=1`;
    const r = await fetch(url);
    if (!r.ok) {
      if (r.status === 400 || r.status === 404) reachedEnd = true;
      throw new Error(`HTTP ${r.status}`);
    }
    const posts = await r.json();
    return posts.filter(p => !isCartoon(p));
  };

  const loadNextPage = async () => {
    if (loading || reachedEnd || route !== 'home') return;
    loading = true;
    try {
      const posts = await fetchPosts(page);
      if (!posts.length) { reachedEnd = true; return; }
      rememberPage(page, posts);
      renderPostsPage(posts);
      page += 1;
    } finally {
      loading = false;
    }
  };

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

  // Single-flight infinite scroll with early preload
  const io = new IntersectionObserver(async (entries) => {
    const first = entries[0];
    if (!first.isIntersecting || loading) return;
    await loadNextPage();
  }, { rootMargin: '1200px 0px 800px 0px', threshold: 0 });

  // Keep masonry class present without heavy work
  const mo = new MutationObserver(() => {
    const feed = document.querySelector('.posts-grid');
    if (!feed) return;
    // nothing heavy here; your CSS handles columns
  });

  const toggleMenu = () => {
    const open = menu?.hasAttribute('hidden') ? false : true;
    if (open) {
      menu.setAttribute('hidden', '');
      hamburger?.setAttribute('aria-expanded', 'false');
    } else {
      menu?.removeAttribute('hidden');
      hamburger?.setAttribute('aria-expanded', 'true');
    }
  };

  const start = async () => {
    window.addEventListener('hashchange', router);
    hamburger?.addEventListener('click', toggleMenu);

    await router();

    if (route === 'home') {
      io.observe(sentinel);
      await loadNextPage();
    }

    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
  };

  start();
  try { console.info('[OkObserver] class-name hotfix', APP_VERSION); } catch {}
})();
 /* 🔴 main.js */
