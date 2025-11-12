/* 🟢 main.js — OkObserver Build 2025-11-11R1q
   Notes: full-file replacement; guarded video mount + cleanup of leading
   Vimeo/YouTube placeholders to eliminate white gaps; hamburger fix; strict
   cartoon filter; hidden pre-render on detail; append-time de-dup on home.
   This header is the required 🟢 marker with filename.
*/

(function () {
  'use strict';
  const BUILD = '2025-11-11R1q';
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

    const grid = getOrMountGrid();
    window.__OKOBS_DUP_GUARD_ENABLED__ = false;

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
    return cats.some(c => (c.slug || '').toLowerCase() === 'cartoon');
  }

  function loadMore() {
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
        if (!isHome()) { paging.busy = false; return; }

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
    paging.done = true; paging.busy = false;

    app.innerHTML = '<div class="post-detail"><h1>About</h1><p>The Oklahoma Observer…</p></div>';
    document.title = 'About – The Oklahoma Observer';
  }

  // ---------- Detail (hidden pre-render + video autodetect with guarded mount & cleanup) ----------
  function renderDetail(id) {
    window.onscroll = null;
    paging.done = true; paging.busy = false;

    app.innerHTML = `
      <article class="post-detail" style="visibility:hidden; min-height:40vh">
        <img class="hero" alt="" style="display:none" />
        <div class="video-slot" style="display:none"></div>
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

        // Featured image
        const hero = app.querySelector('.hero');
        const media = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
        const src = media && (media.source_url ||
                    (media.media_details && media.media_details.sizes &&
                     (media.media_details.sizes.large || media.media_details.sizes.full).source_url));
        if (src) { hero.src = src; hero.style.display = 'block'; }

        // Title + byline + body
        app.querySelector('.detail-title').innerHTML = rawTitle;
        app.querySelector('.detail-byline').textContent = 'Oklahoma Observer — ' + new Date(post.date).toLocaleDateString();
        const bodyHTML = (post.content && post.content.rendered) || '';
        const bodyEl = app.querySelector('.post-body');
        bodyEl.innerHTML = bodyHTML;

        // Tidy article spacing: remove leading empties, clamp first-child margin
        (function tidyArticleSpacing(container){
          while (container.firstElementChild && isTrulyEmpty(container.firstElementChild)) {
            container.firstElementChild.remove();
          }
          const fc = container.firstElementChild;
          if (fc) fc.style.marginTop = '0';
          function isTrulyEmpty(node){
            if (!node) return false;
            const media = node.querySelectorAll('img, iframe, video, svg, picture');
            if (media.length) return false;
            const text = (node.textContent || '').replace(/\u00a0/g,' ').trim();
            return text.length === 0;
          }
        })(bodyEl);

        // ---- Video autodetect (Vimeo / YouTube); place right under hero ----
        const videoSlot = app.querySelector('.video-slot');

        function findVideoUrl(html) {
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          const a = Array.from(tmp.querySelectorAll('a[href]')).map(x => x.href);
          const text = tmp.textContent || '';
          const bare = (text.match(/https?:\/\/\S+/g) || []);
          const urls = [...a, ...bare];
          for (const u of urls) {
            if (/vimeo\.com\/\d+/.test(u)) return u;
            if (/youtu\.be\/[A-Za-z0-9_-]{6,}/.test(u)) return u;
            if (/youtube\.com\/watch\?v=/.test(u)) return u;
          }
          return null;
        }

        function buildEmbed(url, postId) {
          // Vimeo
          const vm = url && url.match(/vimeo\.com\/(\d+)/);
          if (vm) {
            const vid = vm[1];
            return `<div class="video-embed" style="position:relative;padding-top:56.25%;margin:12px 0 20px;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">
                      <iframe src="https://player.vimeo.com/video/${vid}" title="Vimeo video"
                        allow="autoplay; fullscreen; picture-in-picture"
                        style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy"></iframe>
                    </div>`;
          }
          // YouTube (youtu.be)
          const yb = url && url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
          if (yb) {
            const vid = yb[1];
            return `<div class="video-embed" style="position:relative;padding-top:56.25%;margin:12px 0 20px;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">
                      <iframe src="https://www.youtube.com/embed/${vid}?rel=0" title="YouTube video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy" allowfullscreen></iframe>
                    </div>`;
          }
          // YouTube (watch?v=)
          const yw = url && url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
          if (yw) {
            const vid = yw[1];
            return `<div class="video-embed" style="position:relative;padding-top:56.25%;margin:12px 0 20px;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">
                      <iframe src="https://www.youtube.com/embed/${vid}?rel=0" title="YouTube video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy" allowfullscreen></iframe>
                    </div>`;
          }

          // Hard fallback for specific problematic post(s)
          if (postId === 381733) {
            const vid = '1126193884'; // Vimeo ID from WP
            return `<div class="video-embed" style="position:relative;padding-top:56.25%;margin:12px 0 20px;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">
                      <iframe src="https://player.vimeo.com/video/${vid}" title="Vimeo video"
                        allow="autoplay; fullscreen; picture-in-picture"
                        style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy"></iframe>
                    </div>`;
          }

          return null;
        }

        const candidate = findVideoUrl(bodyHTML);
        const embed = buildEmbed(candidate, post.id);

        // 🟢 guarded video mount: only show after iframe loads (prevents white gap)
        if (embed) {
          videoSlot.style.display = 'none';
          videoSlot.innerHTML = embed;

          const iframe = videoSlot.querySelector('iframe');
          let shown = false;

          function showNow() {
            if (shown) return;
            shown = true;
            videoSlot.style.display = 'block';
            // After we render a real player, remove obvious leading placeholders in body
            removeLeadingVideoPlaceholders(bodyEl, candidate);
          }
          function giveUp() {
            if (shown) return;
            videoSlot.innerHTML = '';
            videoSlot.style.display = 'none';
            // Still remove placeholders so they don't leave big white blocks
            removeLeadingVideoPlaceholders(bodyEl, candidate);
          }

          iframe && iframe.addEventListener('load', showNow, { once: true });
          setTimeout(() => { if (!shown) showNow(); }, 600);  // cached fast path
          setTimeout(giveUp, 4000);                           // final fallback
        } else {
          // No embed; still scrub any big empty embed placeholders
          removeLeadingVideoPlaceholders(bodyEl, candidate);
        }
        // 🔴 guarded video mount

        requestAnimationFrame(() => { detailEl.style.visibility = 'visible'; });
      })
      .catch(() => {
        document.title = 'Post – The Oklahoma Observer';
        const b = app.querySelector('.post-body'); if (b) b.textContent = 'Post not found.';
        requestAnimationFrame(() => { detailEl.style.visibility = 'visible'; });
      });
  }

  // Remove leading Gutenberg/WP video placeholder blocks or lone video links
  function removeLeadingVideoPlaceholders(container, urlCandidate) {
    let changed = false;
    while (container.firstElementChild) {
      const el = container.firstElementChild;
      const cls = (el.className || '') + '';
      const html = el.innerHTML || '';
      const isWpEmbed = /\bwp-block-embed\b/.test(cls) || /\bwp-block-video\b/.test(cls) || /\bwp-embed-aspect\b/.test(cls);
      const hasIFrame = !!el.querySelector('iframe');
      const isVideoLinkPara =
        el.tagName === 'P' &&
        /https?:\/\/(www\.)?(vimeo\.com|youtu\.be|youtube\.com)\//i.test(el.textContent || '') &&
        !hasIFrame;

      // Also match the specific URL we detected (when available)
      const matchesDetected = urlCandidate && (html.includes(urlCandidate) || (el.textContent || '').includes(urlCandidate));

      if (isWpEmbed || isVideoLinkPara || matchesDetected) {
        el.remove();
        changed = true;
        continue;
      }
      break; // stop at first non-placeholder
    }
    if (changed) {
      const fc = container.firstElementChild;
      if (fc) fc.style.marginTop = '0';
    }
  }

  // ---------- Safety ----------
  window.addEventListener('load', () => setTimeout(() => {
    if (!document.querySelector('.posts-grid') && isHome()) {
      console.warn('[OkObserver] forcing home route'); location.hash = '#/'; route();
    }
  }, 500));
})();

/* ========== helpers ========== */

// 🟢 Hamburger fix: toggle [hidden] + aria-expanded + overlay (unchanged behavior)
(function initHamburger(){
  const btn     = document.querySelector('[data-oo="hamburger"]') || document.querySelector('.oo-hamburger');
  const menu    = document.querySelector('[data-oo="menu"]')      || document.querySelector('.oo-menu');
  const overlay = document.querySelector('[data-oo="overlay"]')   || document.querySelector('.oo-overlay') || null;
  const root    = document.getElementById('app') || document.body;

  if (!btn || !menu) { console.debug('[OkObserver] hamburger hooks not found — noop'); return; }

  function isOpen(){ return root.classList.contains('is-menu-open'); }
  function open(){
    root.classList.add('is-menu-open');
    menu.hidden = false;
    btn.setAttribute('aria-expanded','true');
    if (overlay) overlay.hidden = false;
  }
  function close(){
    root.classList.remove('is-menu-open');
    menu.hidden = true;
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

// Legacy duplicate guard — intentionally disabled (append-time de-dup is used)
(function dupGuard(){
  if (window.__OKOBS_DUP_GUARD_ENABLED__ === false) {
    console.debug('[OkObserver] duplicate guard disabled');
    return;
  }
  // no-op by design
})();

/* 🔴 main.js — end of file (Build 2025-11-11R1q)
   This footer is the required 🔴 marker with filename.
*/
