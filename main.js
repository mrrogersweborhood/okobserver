/* 🟢 main.js */
(function () {
  'use strict';

  const APP_VERSION = '2025-11-03R1a';
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

  // 🔁 HOTFIX: revert to baseline image URL (no &w=…)
  const buildImgHtml = (mediaId, postId) => {
    if (!mediaId) return '';
    const src = `${API_BASE}/media/${mediaId}?cb=${postId}`;
    return `
      <img
        class="oo-card__img"
        src="${src}"
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
    const ex = post.excerpt?.rendered || '';
    return `<div class="oo-card__excerpt">${ex}</div>`;
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
    const container = document.getElementById('oo-feed');
    if (!container) return;
    while (container.children.length > MAX_CARDS) {
      container.removeChild(container.firstElementChild);
    }
  };

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
    } catch (_) {
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

  const io = new IntersectionObserver(async (entries) => {
    const first = entries[0];
    if (!first.isIntersecting) return;
    if (loading) return;
    await loadNextPage();
  }, { rootMargin: '1200px 0px 800px 0px', threshold: 0 });

  const gridTarget = document.body;
  let rafToken = null;
  const mo = new MutationObserver(() => {
    if (rafToken) return;
    rafToken = requestAnimationFrame(() => {
      rafToken = null;
      const feed = document.getElementById('oo-feed');
      if (!feed) return;
      if (!feed.classList.contains('oo-grid')) feed.classList.add('oo-grid');
    });
  });

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

  const start = async () => {
    window.addEventListener('hashchange', router);
    hamburger?.addEventListener('click', toggleMenu);

    await router();

    if (route === 'home') {
      io.observe(sentinel);
      await loadNextPage();
    }

    mo.observe(gridTarget, { childList: true, subtree: true, attributes: true });
  };

  start();
  try { console.info('[OkObserver] Hotfix build', APP_VERSION); } catch {}
})();
 /* 🔴 main.js */
