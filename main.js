// 🟢 main.js — start of full file
// 🟢 main.js — OkObserver Build 2025-11-12R1h12
/* Full-file replacement (no truncation).
   Key updates for this revision:
   - Consolidated hamburger controller into a single, stable block.
   - Motto hardening:
     * Injected CSS to ensure .oo-motto never shows underline / pointer cursor.
     * DOM fix to move .oo-motto out of the <a.oo-brand> link, so the motto
       physically cannot be a link target anymore.

   Other preserved behavior:
   - Vimeo/YouTube: responsive iframe embed + optional CTA link.
   - For Facebook videos: we DO NOT render an iframe nor a separate video box.
     Instead we turn the featured image (hero) into a clickable overlay with a
     centered “Watch on Facebook” button.
   - Preserve <a> links in excerpts; unwrap other tags.
   - Scrub Gutenberg/embed wrappers that caused leading white gap.
   - Reveal detail after media/body ready to avoid flashes.
   - Bold byline under image; hard fallback for post 381733 (Vimeo id 1126193884).
   - Strict cartoon filter & duplicate guard on home (4/3/1 grid via CSS).
*/

(function () {
  'use strict';
  const BUILD = '2025-11-12R1h12';
  console.log('[OkObserver] Main JS Build', BUILD);

  const API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  let app = document.getElementById('app');

  // ---------- Router ----------
  window.addEventListener('hashchange', route);
  window.addEventListener('load', route);
  function isHome(){ return (location.hash || '#/') === '#/'; }
  function route() {
    const hash = location.hash || '#/';
    if (hash.startsWith('#/post/')) renderDetail(+hash.split('/')[2]);
    else if (hash.startsWith('#/about')) renderAbout();
    else renderHome();
    document.dispatchEvent(new CustomEvent('okobs:route', { detail:{hash} }));
  }
  window.__ok_route = h => { if (h) location.hash=h; route(); };

  // ---------- Home ----------
  const paging = { page:1, busy:false, done:false };
  const seenIds = new Set();
  let DISABLE_CARTOON_FILTER = false;
  window.__ok_disableCartoonFilter = (on=true)=>{ DISABLE_CARTOON_FILTER=!!on; location.hash='#/'; route(); };

  function getOrMountGrid(){
    if (!app) app = document.getElementById('app');
    let grid = app && app.querySelector('.posts-grid');
    if (!grid){
      grid = document.createElement('section');
      grid.className = 'posts-grid';
      app.innerHTML = '';
      app.appendChild(grid);
    }
    return grid;
  }

  function makeCard(post){
    const el = document.createElement('article');
    el.className = 'post-card';
    const title = decodeHtml(post.title && post.title.rendered || '');
    const date = new Date(post.date);
    const byline = (post._embedded && post._embedded.author && post._embedded.author[0] && post._embedded.author[0].name) || 'Oklahoma Observer';
    const img = (post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0] && post._embedded['wp:featuredmedia'][0].source_url) || '';

    // Preserve anchors anywhere in the excerpt (unwrap others, keep children)
    const excerptHTML = sanitizeExcerptKeepAnchors(decodeHtml((post.excerpt && post.excerpt.rendered) || '')).trim();

    el.innerHTML = `
      <a class="thumb" href="#/post/${post.id}" aria-label="${escapeHtmlAttr(title)}">
        ${img ? `<img src="${img}?cb=${post.id}" alt="">` : ''}
      </a>
      <h2 class="title"><a href="#/post/${post.id}">${title}</a></h2>
      <div class="meta">${byline} — ${date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</div>
      <p class="excerpt">${excerptHTML}</p>
    `;
    return el;
  }

  function renderHome(){
    document.title = 'The Oklahoma Observer';
    const grid = getOrMountGrid();
    window.__OKOBS_DUP_GUARD_ENABLED__ = true;

    paging.page=1; paging.busy=false; paging.done=false;
    seenIds.clear(); grid.innerHTML='';
    loadMore();
    window.onscroll = onScroll;
  }

  function onScroll(){
    if (paging.busy || paging.done || !isHome()) return;
    const nearBottom = (innerHeight + scrollY) >= (document.body.offsetHeight - 1000);
    if (nearBottom) loadMore();
  }

  function isCartoonSlugList(cats){ return cats.some(c => (c.slug||'').toLowerCase()==='cartoon'); }

  function loadMore(){
    if (!isHome() || paging.busy || paging.done) return;
    paging.busy = true;

    fetch(`${API}/posts?_embed&per_page=12&page=${paging.page}`)
      .then(r=>{ if(!r.ok){ if(r.status===400||r.status===404) paging.done=true; throw new Error('no more'); } return r.json(); })
      .then(arr=>{
        if (!isHome()) { paging.busy=false; return; }
        const grid = document.querySelector('#app .posts-grid') || getOrMountGrid();
        let rendered=0;

        arr.forEach(p=>{
          const id = String(p.id);
          if (seenIds.has(id)) return;

          const cats = (p._embedded && p._embedded['wp:term'] && p._embedded['wp:term'][0]) || [];
          if (!window.__OKOBS_DUP_GUARD_ENABLED__ && seenIds.has(id)) return;
          if (!DISABLE_CARTOON_FILTER && isCartoonSlugList(cats)) return;

          const card = makeCard(p);
          if (!isHome()) return;
          (document.querySelector('#app .posts-grid') || grid).appendChild(card);
          seenIds.add(id); rendered++;
        });

        paging.page += 1; paging.busy=false;
        if (arr.length===0 || rendered===0) paging.done=true;
      })
      .catch(()=>{ paging.busy=false; paging.done=true; });
  }

  // ---------- About ----------
  function renderAbout(){
    window.onscroll = null; paging.done=true; paging.busy=false;
    app.innerHTML = '<div class="post-detail"><h1>About</h1><p>The Oklahoma Observer…</p></div>';
    document.title = 'About – The Oklahoma Observer';
  }

  // ---------- Detail ----------
  function renderDetail(id){
    window.onscroll = null; paging.done=true; paging.busy=false;

    // Hide until media/body ready to avoid a flash
    app.innerHTML = `
      <article class="post-detail" style="visibility:hidden; min-height:40vh">
        <div class="hero-wrap" style="position:relative;">
          <img class="hero" alt="" style="display:none" />
        </div>
        <div class="video-slot" style="display:none"></div>
        <h1 class="detail-title"></h1>
        <div class="detail-byline" style="font-weight:700;"></div>
        <div class="post-body"></div>
        <div class="back-row"><a class="back" href="#/">&larr; Back to Posts</a></div>
      </article>
    `;

    fetch(`${API}/posts/${id}?_embed`).then(r=>r.json()).then(post=>{
      const detailEl = app.querySelector('.post-detail');
      const heroWrap = app.querySelector('.hero-wrap');
      const hero = app.querySelector('.hero');
      const titleEl = app.querySelector('.detail-title');
      const bylineEl = app.querySelector('.detail-byline');
      const bodyEl = app.querySelector('.post-body');

      const title = decodeHtml(post.title && post.title.rendered || '');
      document.title = `${title} – The Oklahoma Observer`;

      titleEl.textContent = title;
      bylineEl.textContent = buildByline(post);

      const img = (post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0] && post._embedded['wp:featuredmedia'][0].source_url) || '';
      if (img){ hero.src = img + `?cb=${post.id}`; hero.style.display='block'; hero.alt = title; }

      let bodyHTML = (post.content && post.content.rendered) || '';
      bodyHTML = decodeHtml(bodyHTML);
      bodyEl.innerHTML = bodyHTML;

      // scrub empty/ratio wrappers that create leading white gap
      tidyArticleSpacing(bodyEl);

      const videoSlot = app.querySelector('.video-slot');
      const candidate = findVideoUrl(bodyHTML);
      const isFB = candidate && /facebook\.com/i.test(candidate);

      if (isFB) {
        // Turn HERO into a “watch on Facebook” overlay (no separate video box)
        if (heroWrap && hero){
          heroWrap.style.borderRadius = '12px';
          heroWrap.style.overflow = 'hidden';
          heroWrap.style.boxShadow = '0 8px 22px rgba(0,0,0,.15)';
          hero.style.display='block';
          hero.style.width='100%';
          hero.style.height='auto';
          // Button overlay
          const btn = document.createElement('a');
          btn.href = candidate;
          btn.target = '_blank';
          btn.rel = 'noopener';
          btn.textContent = 'Watch on Facebook ↗';
          btn.setAttribute('aria-label','Watch on Facebook');
          Object.assign(btn.style, {
            position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
            background:'#1E90FF', color:'#fff', padding:'12px 18px', borderRadius:'999px',
            textDecoration:'none', fontWeight:'700', boxShadow:'0 2px 10px rgba(0,0,0,.25)'
          });
          heroWrap.appendChild(btn);
        }
        // Ensure any leading embed placeholders are gone
        scrubLeadingEmbedPlaceholders(bodyEl, candidate);
      } else {
        // Vimeo/YouTube / special-case fallback path
        const embed = buildEmbed(candidate, post.id);
        if (embed){
          videoSlot.style.display='none';
          videoSlot.innerHTML = embed + (buildExternalCTA(candidate) || '');
          const iframe = videoSlot.querySelector('iframe');
          let shown=false;
          const showNow = ()=>{ if(shown) return; shown=true; videoSlot.style.display='block'; scrubLeadingEmbedPlaceholders(bodyEl, candidate); };
          const giveUp  = ()=>{ if(shown) return; shown=true; videoSlot.style.display='block'; scrubLeadingEmbedPlaceholders(bodyEl, candidate); };
          iframe && iframe.addEventListener('load', showNow, { once:true });
          setTimeout(showNow, 600);
          setTimeout(giveUp, 4000);
        } else {
          scrubLeadingEmbedPlaceholders(bodyEl, candidate);
        }
      }

      requestAnimationFrame(()=>{ detailEl.style.visibility='visible'; detailEl.style.minHeight=''; });
    }).catch(()=>{
      document.title='Post – The Oklahoma Observer';
      const b = app.querySelector('.post-body'); if (b) b.textContent='Post not found.';
      requestAnimationFrame(()=>{ const d=app.querySelector('.post-detail'); if(d){d.style.visibility='visible'; d.style.minHeight='';} });
    });
  }

  function buildByline(post){
    const by = (post._embedded && post._embedded.author && post._embedded.author[0] && post._embedded.author[0].name) || 'Oklahoma Observer';
    const dt = new Date(post.date);
    return `${by} — ${dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}`;
  }

  // ---- helpers ----
  function decodeHtml(s=''){ const el = document.createElement('textarea'); el.innerHTML = s; return el.value; }
  function escapeHtmlAttr(s=''){ return (s+'').replace(/"/g,'&quot;'); }

  // Keep anchors anywhere; unwrap other elements but preserve their children
  function sanitizeExcerptKeepAnchors(html=''){
    const root = document.createElement('div');
    root.innerHTML = html;
    root.querySelectorAll('script,style,noscript').forEach(n=>n.remove());
    const out = [];
    (function collect(node){
      node.childNodes.forEach(n=>{
        if (n.nodeType === 3) out.push(n.textContent);
        else if (n.nodeType === 1){
          if (n.tagName === 'A'){
            const a = n.cloneNode(true);
            a.removeAttribute('onclick');
            a.setAttribute('target','_blank');
            a.setAttribute('rel','noopener');
            out.push(a.outerHTML);
          } else collect(n);
        }
      });
    })(root);
    return out.join('').replace(/\s+\n/g,' ').replace(/\s{2,}/g,' ').trim();
  }

  // Detect video URL (Vimeo/YouTube/Facebook)
  function findVideoUrl(html){
    if (!html) return null;
    // Vimeo
    let m = html.match(/https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/); if (m) return m[0];
    // YouTube
    m = html.match(/https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{6,})/); if (m) return m[0];
    m = html.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?[^"']*v=([A-Za-z0-9_-]{6,})/); if (m) return m[0];
    // Facebook
    m = html.match(/https?:\/\/(?:www\.)?facebook\.com\/[^"'\s]+\/videos\/(\d+)/i); if (m) return m[0];
    m = html.match(/https?:\/\/(?:www\.)?facebook\.com\/watch\/?\?[^"'\s]*v=(\d+)/i); if (m) return m[0];
    return null;
  }

  // Build external CTA used for iframe hosts (not used for FB since hero handles it)
  function buildExternalCTA(url){
    if (!url) return '';
    if (/facebook\.com/i.test(url)) return '';
    const isYT = /youtu(?:\.be|be\.com)/i.test(url);
    const isVM = /vimeo\.com/i.test(url);
    const label = isYT ? 'Watch on YouTube' : isVM ? 'Watch on Vimeo' : 'Open Video';
    return `
      <div class="ext-cta" style="margin-top:12px">
        <a href="${url}" target="_blank" rel="noopener"
           style="display:inline-block;background:#1E90FF;color:#fff;padding:10px 16px;border-radius:8px;
                  text-decoration:none;font-weight:600;box-shadow:0 2px 10px rgba(0,0,0,.08)">
          ${label} ↗
        </a>
      </div>`;
  }

  // Build embed iframe for Vimeo/YouTube only; plus hard fallback for 381733
  function buildEmbed(url, postId){
    if (!url) return '';
    // Vimeo
    let m = url.match(/vimeo\.com\/(\d+)/);
    if (m){
      const vid = m[1];
      return `<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">
                <iframe src="https://player.vimeo.com/video/${vid}" title="Vimeo video"
                  allow="autoplay; fullscreen; picture-in-picture"
                  style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy"></iframe>
              </div>`;
    }
    // YouTube
    m = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
    if (m){
      const vid = m[1];
      return `<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">
                <iframe src="https://www.youtube.com/embed/${vid}?rel=0" title="YouTube video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy" allowfullscreen></iframe>
              </div>`;
    }
    m = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (m){
      const vid = m[1];
      return `<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">
                <iframe src="https://www.youtube.com/embed/${vid}?rel=0" title="YouTube video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy" allowfullscreen></iframe>
              </div>`;
    }
    // Hard fallback for 381733 if nothing else matched
    if (postId === 381733){
      const vid='1126193884';
      return `<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">
                <iframe src="https://player.vimeo.com/video/${vid}" title="Vimeo video"
                  allow="autoplay; fullscreen; picture-in-picture"
                  style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy"></iframe>
              </div>`;
    }
    return '';
  }

  function tidyArticleSpacing(container){
    // Remove empty wrapper blocks that cause leading white gap
    const blocks = container.querySelectorAll('.wp-block-embed, .wp-block-video, .wp-embed-aspect-16-9, .wp-embed-aspect-4-3');
    blocks.forEach(b=>{
      if (!b.querySelector('iframe, video')) b.remove();
    });
    // Trim empty leading nodes
    while (container.firstElementChild && looksEmpty(container.firstElementChild)){
      container.firstElementChild.remove();
    }
  }
  function looksEmpty(node){
    if (!node) return false;
    if (node.querySelector('img,iframe,video,svg,picture')) return false;
    const text = (node.textContent || '').replace(/\u00a0/g,' ').trim();
    return text.length===0;
  }

  function scrubLeadingEmbedPlaceholders(container, urlCandidate){
    let changed=false;
    while (container.firstElementChild){
      const el = container.firstElementChild;
      const cls = (el.className||'')+'';
      const html = el.innerHTML||'';
      const hasIframe = !!el.querySelector('iframe, video');
      const isWpEmbed = /\bwp-block-embed\b/.test(cls) || /\bwp-block-video\b/.test(cls) || /\bwp-embed-aspect\b/.test(cls);
      const isVideoLinkPara = el.tagName === 'P' &&
        /https?:\/\/(www\.)?(vimeo\.com|youtu\.be|youtube\.com|facebook\.com)\//i.test((el.textContent||'')) && !hasIframe;
      const style = el.getAttribute('style') || '';
      const looksLikeRatio = /padding-top:\s*(?:56\.25%|75%|62\.5%|[3-8]\d%)/i.test(style) && !hasIframe;
      const matchesDetected = urlCandidate && (html.includes(urlCandidate) || (el.textContent||'').includes(urlCandidate));
      if (isWpEmbed || isVideoLinkPara || looksLikeRatio || matchesDetected){ el.remove(); changed=true; continue; }
      break;
    }
    if (changed){
      const fc = container.firstElementChild;
      if (fc) fc.style.marginTop='0';
    }
  }
})();

/* 🟢 main.js — Hamburger controller v2025-11-12H3 */
(function () {
  function initHamburger() {
    const btn = document.querySelector('[data-oo="hamburger"]') || document.querySelector('.oo-hamburger');
    const menu = document.querySelector('[data-oo="menu"]')      || document.querySelector('.oo-menu');
    const overlay = document.querySelector('[data-oo="overlay"]')|| document.querySelector('.oo-overlay');

    if (!btn || !menu) {
      console.warn('[OkObserver] hamburger elements missing');
      return;
    }

    const root = document.documentElement;
    const isOpen = () => root.classList.contains('is-menu-open');

    const openMenu = () => {
      root.classList.add('is-menu-open');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      if (overlay) overlay.hidden = false;
    };

    const closeMenu = () => {
      root.classList.remove('is-menu-open');
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (overlay) overlay.hidden = true;
    };

    const toggleMenu = (ev) => {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      if (isOpen()) closeMenu();
      else openMenu();
    };

    // Button click / keyboard
    btn.addEventListener('click', toggleMenu);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        toggleMenu(e);
      }
    });

    // Overlay click closes
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        e.preventDefault();
        closeMenu();
      });
    }

    // Click outside menu closes
    document.addEventListener('click', (e) => {
      if (!isOpen()) return;
      if (menu.contains(e.target) || btn.contains(e.target)) return;
      closeMenu();
    });

    // ESC closes
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        closeMenu();
      }
    });

    // Route change / resize close
    window.addEventListener('hashchange', closeMenu);
    window.addEventListener('resize', () => {
      if (isOpen() && window.innerWidth >= 900) {
        closeMenu();
      }
    });

    // Menu link click closes
    menu.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (a) {
        closeMenu();
      }
    });

    // Basic ARIA
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-expanded', 'false');
    if (!btn.hasAttribute('tabindex')) btn.setAttribute('tabindex', '0');

    console.log('[OkObserver] hamburger ready (single controller)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHamburger, { once:true });
  } else {
    initHamburger();
  }
})();
/* 🔴 main.js — Hamburger controller v2025-11-12H3 */

/* 🟢 main.js — Motto CSS hardening (never a link) */
(function () {
  try {
    const css = `
      .oo-brand,
      .oo-brand:link,
      .oo-brand:visited,
      .oo-brand:hover,
      .oo-brand:focus,
      .oo-brand:active {
        text-decoration: none !important;
      }
      .oo-motto {
        text-decoration: none !important;
        pointer-events: none !important;
        cursor: default !important;
      }
    `;
    const style = document.createElement('style');
    style.setAttribute('data-oo', 'motto-link-kill');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  } catch (err) {
    console.warn('[OkObserver] motto CSS hardening failed:', err);
  }
})();
/* 🔴 main.js — Motto CSS hardening (never a link) */

/* 🟢 main.js — Motto DOM fix (move motto out of brand link) */
(function () {
  function moveMottoOutOfLink() {
    try {
      const brand = document.querySelector('.oo-header-inner .oo-brand');
      if (!brand) return;
      const motto = brand.querySelector('.oo-motto');
      if (!motto) return;
      const parent = brand.parentElement;
      if (!parent) return;

      // Only move if motto is currently inside the <a.oo-brand>
      if (motto.parentElement === brand) {
        parent.insertBefore(motto, brand.nextSibling);
      }
    } catch (err) {
      console.warn('[OkObserver] motto DOM fix failed:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', moveMottoOutOfLink, { once:true });
  } else {
    moveMottoOutOfLink();
  }
})();
/* 🔴 main.js — Motto DOM fix (move motto out of brand link) */

// 🔴 main.js — end of full file
