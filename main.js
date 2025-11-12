// 🟢 main.js — OkObserver Build 2025-11-11R1k (hidden pre-render fix for post detail)
(function () {
  'use strict';
  const BUILD = '2025-11-11R1k';
  console.log('[OkObserver] Main JS Build', BUILD);

  const API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  let app = document.getElementById('app');

  // ---------- Router ----------
  window.addEventListener('hashchange', route);
  window.addEventListener('load', route);

  function route() {
    const hash = location.hash || '#/';
    console.log('[OkObserver] route()', hash);
    if (hash.startsWith('#/post/')) renderDetail(+hash.split('/')[2]);
    else if (hash.startsWith('#/about')) renderAbout();
    else renderHome();
    document.dispatchEvent(new CustomEvent('okobs:route', { detail: { hash } }));
  }
  window.__ok_route = h => { if (h) location.hash = h; route(); };

  // ---------- Home State ----------
  const paging = { page: 1, busy: false, done: false };
  let DISABLE_CARTOON_FILTER = false;
  const seenIds = new Set();

  window.__ok_disableCartoonFilter = (on = true) => {
    DISABLE_CARTOON_FILTER = !!on;
    console.warn('[OkObserver] cartoon filter disabled =', DISABLE_CARTOON_FILTER);
    location.hash = '#/'; route();
  };

  function getOrMountGrid() {
    if (!app) app = document.getElementById('app');
    let grid = app && app.querySelector('.posts-grid');
    if (!grid) {
      grid = document.createElement('section');
      grid.className = 'posts-grid';
      app.innerHTML = '';
      app.appendChild(grid);
    }
    return grid;
  }

  function renderHome() {
    console.log('[OkObserver] renderHome() start');
    window.onscroll = null;
    const grid = getOrMountGrid();
    window.__OKOBS_DUP_GUARD_ENABLED__ = false;
    paging.page = 1; paging.busy = false; paging.done = false;
    seenIds.clear();
    grid.innerHTML = '';
    loadMore();
    window.onscroll = onScroll;
  }

  function onScroll() {
    if (paging.busy || paging.done) return;
    const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 1000);
    if (nearBottom) loadMore();
  }

  function isCartoonSlugList(cats) {
    return cats.some(c => (c.slug || '').toLowerCase() === 'cartoon');
  }

  function loadMore() {
    if (paging.busy || paging.done) return;
    paging.busy = true;
    console.log('[OkObserver] loadMore page', paging.page);

    fetch(`${API}/posts?_embed&per_page=12&page=${paging.page}`)
      .then(r => {
        console.log('[OkObserver] posts status', r.status);
        if (!r.ok) { if (r.status === 400 || r.status === 404) paging.done = true; throw new Error('no more'); }
        return r.json();
      })
      .then(arr => {
        console.log('[OkObserver] received posts:', arr.length);
        let skipped = 0, rendered = 0;
        const preview = [];
        const grid = document.querySelector('#app .posts-grid') || getOrMountGrid();

        arr.forEach(p => {
          const id = String(p.id);
          if (seenIds.has(id)) return;
          const cats = (p._embedded && p._embedded['wp:term'] && p._embedded['wp:term'][0]) || [];
          const isCartoon = !DISABLE_CARTOON_FILTER && isCartoonSlugList(cats);
          if (isCartoon) { skipped++; return; }
          if (preview.length < 3) preview.push((p.title && p.title.rendered) || 'Untitled');

          const link = `#/post/${p.id}`;
          const title = (p.title && p.title.rendered) || 'Untitled';
          const dt = new Date(p.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
          const media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
          const src = media && (media.source_url ||
                      (media.media_details && media.media_details.sizes &&
                       (media.media_details.sizes.medium || media.media_details.sizes.full).source_url));

          const card = document.createElement('article');
          card.className = 'post-card';
          card.setAttribute('data-post-id', id);
          card.innerHTML =
            (src ? `<a href="${link}"><img class="thumb" alt="" loading="lazy" src="${src}"></a>` : '') +
            `<div class="pad">
               <h3><a href="${link}">${title}</a></h3>
               <div class="byline">Oklahoma Observer — ${dt}</div>
               <div class="excerpt">${(p.excerpt && p.excerpt.rendered) || ''}</div>
             </div>`;
          (document.querySelector('#app .posts-grid') || grid).appendChild(card);
          seenIds.add(id);
          rendered++;
        });

        console.log(`[OkObserver] render summary — rendered: ${rendered}, skipped(cartoon): ${skipped}, preview:`, preview);
        paging.page += 1;
        paging.busy = false;
        if (arr.length === 0 || rendered === 0) paging.done = true;
        console.log('[OkObserver] loadMore complete; next page', paging.page, 'done?', paging.done);
      })
      .catch(err => {
        console.warn('[OkObserver] loadMore error', err);
        paging.busy = false; paging.done = true;
      });
  }
  window.__ok_loadMore = () => { try { loadMore(); } catch (e) { console.error(e); } };

  // ---------- Static Pages ----------
  function renderAbout() {
    window.onscroll = null;
    app.innerHTML = '<div class="post-detail"><h1>About</h1><p>The Oklahoma Observer…</p></div>';
    document.title = 'About – The Oklahoma Observer';
  }

  // ---------- Improved Detail ----------
  function renderDetail(id) {
    window.onscroll = null;
    paging.done = true; paging.busy = false;

    // Mount hidden shell
    app.innerHTML = `
      <article class="post-detail" style="visibility:hidden; min-height:40vh">
        <img class="hero" alt="" style="display:none" />
        <h1 class="detail-title"></h1>
        <div class="detail-byline"></div>
        <div class="post-body"></div>
        <p><a class="btn-back" href="#/">← Back to Posts</a></p>
      </article>`;
    const detailEl = app.querySelector('.post-detail');

    fetch(`${API}/posts/${id}?_embed`)
      .then(r => r.json())
      .then(post => {
        const rawTitle = (post.title && post.title.rendered) || '';
        const clean = (function (h) { const d = document.createElement('div'); d.innerHTML = h; return d.textContent || d.innerText || ''; })(rawTitle);
        document.title = `${clean} – The Oklahoma Observer`;

        const hero = app.querySelector('.hero');
        const media = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
        const src = media && (media.source_url ||
                    (media.media_details && media.media_details.sizes &&
                     (media.media_details.sizes.large || media.media_details.sizes.full).source_url));
        if (src) { hero.src = src; hero.style.display = 'block'; }

        app.querySelector('.detail-title').innerHTML = rawTitle;
        app.querySelector('.detail-byline').textContent = 'Oklahoma Observer — ' + new Date(post.date).toLocaleDateString();
        app.querySelector('.post-body').innerHTML = (post.content && post.content.rendered) || 'Post loaded.';

        requestAnimationFrame(() => { detailEl.style.visibility = 'visible'; });
      })
      .catch(() => {
        document.title = 'Post – The Oklahoma Observer';
        const b = app.querySelector('.post-body'); if (b) b.textContent = 'Post not found.';
        requestAnimationFrame(() => { detailEl.style.visibility = 'visible'; });
      });
  }

  window.addEventListener('load', () => setTimeout(() => {
    if (!document.querySelector('.posts-grid') && ((location.hash || '#/') === '#/')) {
      console.warn('[OkObserver] forcing home route'); location.hash = '#/'; route();
    }
  }, 500));
})();

/* ========== helpers ========== */
(function initHamburger(){
  const b = document.querySelector('[data-oo="hamburger"]') || document.querySelector('.oo-hamburger');
  const m = document.querySelector('[data-oo="menu"]') || document.querySelector('.oo-menu');
  if (!b || !m) { console.debug('[OkObserver] hamburger hooks not found — noop'); return; }
  const t = document.getElementById('app') || document.body;
  const o = () => t.classList.add('is-menu-open'), c = () => t.classList.remove('is-menu-open'), i = () => t.classList.contains('is-menu-open');
  b.addEventListener('click', e => { e.stopPropagation(); i() ? c() : o(); });
  document.addEventListener('click', e => { if (!i()) return; if (m.contains(e.target) || b.contains(e.target)) return; c(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && i()) c(); });
  console.debug('[OkObserver] hamburger ready');
})();

(function dupGuard(){
  if (window.__OKOBS_DUP_GUARD_ENABLED__ === false) {
    console.debug('[OkObserver] duplicate guard disabled');
    return;
  }
})();

// 🔴 main.js — end of file (Build 2025-11-11R1k)
