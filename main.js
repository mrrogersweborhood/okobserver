// 🟢 main.js — OkObserver Build 2025-11-11R1m (hamburger fix + detail pre-render + safe home gating)

(function () {
  'use strict';
  const BUILD = '2025-11-11R1m';
  console.log('[OkObserver] Main JS Build', BUILD);

  const API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  let app = document.getElementById('app');

  // ---------- Router ----------
  window.addEventListener('hashchange', route);
  window.addEventListener('load', route);

  function isHome()  { return (location.hash || '#/') === '#/'; }
  function isDetail(){ return (location.hash || '').startsWith('#/post/'); }

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
  const seenIds = new Set(); // append-time de-dup

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

    // mount grid once; clear only at start of Home
    const grid = getOrMountGrid();

    // disable legacy duplicate guard
    window.__OKOBS_DUP_GUARD_ENABLED__ = false;

    // reset state
    paging.page = 1; paging.busy = false; paging.done = false;
    seenIds.clear();
    grid.innerHTML = '';

    loadMore();
    window.onscroll = onScroll;
  }

  function onScroll() {
    if (paging.busy || paging.done || !isHome()) return;
    const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 1000);
    if (nearBottom) loadMore();
  }

  function isCartoonSlugList(cats) {
    // strict: only exclude slug exactly 'cartoon'
    return cats.some(c => (c.slug || '').toLowerCase() === 'cartoon');
  }

  function loadMore() {
    // absolutely no home work if not on home
    if (!isHome()) { paging.busy = false; return; }
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
        // if user navigated away while waiting, bail
        if (!isHome()) { paging.busy = false; return; }

        console.log('[OkObserver] received posts:', arr.length);
        let skipped = 0, rendered = 0;
        const preview = [];

        const grid = document.querySelector('#app .posts-grid') || getOrMountGrid();

        arr.forEach(p => {
          const id = String(p.id);
          if (seenIds.has(id)) return; // append-time de-dup

          const cats = (p._embedded && p._embedded['wp:term'] && p._embedded['wp:term'][0]) || [];
          const isCartoon = !DISABLE_CARTOON_FILTER && isCartoonSlugList(cats);
          if (isCartoon) { skipped++; return; }

          if (preview.length < 3) preview.push((p.title && p.title.rendered) || 'Untitled');

          const link  = `#/post/${p.id}`;
          const title = (p.title && p.title.rendered) || 'Untitled';
          const dt    = new Date(p.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
          const media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
          const src   = media && (media.source_url ||
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

          // append only if still on home at append time
          if (!isHome()) return;
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
    // entering About — stop home work
    paging.done = true; paging.busy = false;

    app.innerHTML = '<div class="post-detail"><h1>About</h1><p>The Oklahoma Observer…</p></div>';
    document.title = 'About – The Oklahoma Observer';
  }

  // ---------- Detail (hidden pre-render to avoid flash) ----------
  function renderDetail(id) {
    window.onscroll = null;
    // entering Detail — stop any further home work
    paging.done = true; paging.busy = false;

    // Mount hidden shell to avoid flash of empty UI
    app.innerHTML = `
      <article class="post-detail" style="visibility:hidden; min-height:40vh">
        <img class="hero" alt="" style="display:none" />
        <h1 class="detail-title"></h1>
        <div class="detail-byline" style="font-weight:600;"></div>
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

  // ---------- Safety ----------
  window.addEventListener('load', () => setTimeout(() => {
    if (!document.querySelector('.posts-grid') && isHome()) {
      console.warn('[OkObserver] forcing home route'); location.hash = '#/'; route();
    }
  }, 500));
})();

/* ========== helpers ========== */

// 🟢 Hamburger fix: toggle [hidden] + aria-expanded + overlay
(function initHamburger(){
  const btn     = document.querySelector('[data-oo="hamburger"]') || document.querySelector('.oo-hamburger');
  const menu    = document.querySelector('[data-oo="menu"]')      || document.querySelector('.oo-menu');
  const overlay = document.querySelector('[data-oo="overlay"]')   || document.querySelector('.oo-overlay') || null;
  const root    = document.getElementById('app') || document.body;

  if (!btn || !menu) { console.debug('[OkObserver] hamburger hooks not found — noop'); return; }

  function isOpen(){ return root.classList.contains('is-menu-open'); }
  function open(){
    root.classList.add('is-menu-open');
    menu.hidden = false;                     // make dropdown visible
    btn.setAttribute('aria-expanded','true');
    if (overlay) overlay.hidden = false;
  }
  function close(){
    root.classList.remove('is-menu-open');
    menu.hidden = true;                      // hide dropdown
    btn.setAttribute('aria-expanded','false');
    if (overlay) overlay.hidden = true;
  }
  function toggle(){ isOpen() ? close() : open(); }

  btn.addEventListener('click', (e)=>{ e.stopPropagation(); toggle(); });
  document.addEventListener('click', (e)=>{
    if (!isOpen()) return;
    if (menu.contains(e.target) || btn.contains(e.target)) return;
    close();
  }, { passive: true });
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && isOpen()) close(); });

  // close menu after navigation click
  menu.addEventListener('click', (e)=>{ const a = e.target.closest('a'); if (a) close(); });

  console.debug('[OkObserver] hamburger ready (hidden toggle + aria)');
})();
// 🔴 Hamburger fix end

// Legacy duplicate guard — intentionally disabled (append-time de-dup is used)
(function dupGuard(){
  if (window.__OKOBS_DUP_GUARD_ENABLED__ === false) {
    console.debug('[OkObserver] duplicate guard disabled');
    return;
  }
  // no-op by design
})();

// 🔴 main.js — end of file (Build 2025-11-11R1m)
