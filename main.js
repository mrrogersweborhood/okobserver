/* 🟢 main.js — 2025-11-03R1d (class alignment rollback) */
(function () {
  'use strict';
  window.AppVersion = '2025-11-03R1d';
  console.log('[OkObserver] main.js', window.AppVersion);

  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PAGE_SIZE = 12;
  const MAX_CARDS = 60;

  let page = 1, loading = false, reachedEnd = false, route = 'home';
  const cachePages = new Map(), lru = [];

  const app = document.getElementById('app');
  const sentinel = document.getElementById('sentinel');
  const menu = document.getElementById('menu');
  const hamburger = document.getElementById('hamburger');

  const fmtDate = iso => {
    try { return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); }
    catch { return ''; }
  };
  const isCartoon = p => (p.title?.rendered || '').toLowerCase().includes('cartoon');
  const byline = p => `${p._embedded?.author?.[0]?.name || 'Staff'} · ${fmtDate(p.date)}`;
  const featuredId = p => p.featured_media || p.featured_media_id || null;

  // Original image behavior (no width params)
  const imgHTML = (mediaId, postId) => mediaId ? `
    <img src="${API_BASE}/media/${mediaId}?cb=${postId}" alt=""
         decoding="async" loading="lazy"
         style="width:100%;height:auto;display:block;border:0;background:#fff;">` : '';

  const excerptHTML = p => `<div class="post-summary">${p.excerpt?.rendered || ''}</div>`;

  const remember = (k, v) => {
    if (cachePages.has(k)) { const i = lru.indexOf(k); if (i>-1) lru.splice(i,1); }
    cachePages.set(k, v); lru.push(k);
    while (lru.length > 6) cachePages.delete(lru.shift());
  };

  const ensureFeed = () => {
    let feed = document.querySelector('.posts-grid');
    if (!feed) {
      feed = document.createElement('div');
      feed.className = 'posts-grid'; // matches override.css
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

  const cardHTML = p => {
    const id = p.id, mid = featuredId(p);
    return `
      <article class="post-card" data-id="${id}">
        <a class="title-link" href="#/post/${id}">
          <div class="thumb">${imgHTML(mid, id)}</div>
          <h2 class="post-title">${p.title?.rendered || ''}</h2>
          <div class="byline">${byline(p)}</div>
          ${excerptHTML(p)}
        </a>
      </article>`;
  };

  const renderPage = posts => {
    const feed = ensureFeed();
    feed.insertAdjacentHTML('beforeend', posts.map(cardHTML).join(''));
    trimCards();
  };

  const renderAbout = () => {
    app.innerHTML = `<section><h1>About The Oklahoma Observer</h1>
      <p>Independent journalism since 1969. Tips: <a href="mailto:okobserver@outlook.com">okobserver@outlook.com</a></p>
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
      const r = await fetch(`${API_BASE}/posts/${id}`);
      const p = await r.json();
      const hero = imgHTML(featuredId(p), id);
      app.innerHTML = `
        <article>
          <h1>${p.title?.rendered || ''}</h1>
          <div class="byline">${byline(p)}</div>
          <div class="post-hero">${hero}</div>
          <div>${p.content?.rendered || ''}</div>
          <p><a class="button" href="#/">Back to Posts</a></p>
        </article>`;
    } catch {
      app.innerHTML = `<div>Failed to load post.</div>`;
    }
  };

  const fetchPosts = async (n) => {
    const r = await fetch(`${API_BASE}/posts?per_page=${PAGE_SIZE}&page=${n}&_embed=1`);
    if (!r.ok) { if (r.status === 400 || r.status === 404) reachedEnd = true; throw new Error(r.status); }
    return (await r.json()).filter(p => !isCartoon(p));
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

  const router = async () => {
    const parts = (location.hash || '#/').slice(2).split('/');
    switch (parts[0]) {
      case '': case 'posts': route = 'home'; ensureFeed(); break;
      case 'about': route = 'about'; return renderAbout();
      case 'settings': route = 'settings'; return renderSettings();
      case 'post': route = 'detail'; return renderDetail(parts[1]);
      default: route = 'home'; ensureFeed(); break;
    }
  };

  const io = new IntersectionObserver(async (entries) => {
    if (!entries[0].isIntersecting || loading) return;
    await loadNext();
  }, { rootMargin: '1200px 0px 800px 0px', threshold: 0 });

  const toggleMenu = () => {
    const open = !menu.hasAttribute('hidden');
    if (open) { menu.setAttribute('hidden',''); hamburger.setAttribute('aria-expanded','false'); }
    else { menu.removeAttribute('hidden'); hamburger.setAttribute('aria-expanded','true'); }
  };

  const start = async () => {
    addEventListener('hashchange', router);
    hamburger?.addEventListener('click', toggleMenu);

    await router();
    if (route === 'home') { io.observe(sentinel); await loadNext(); }
  };

  start();
})();
 /* 🔴 main.js */
