// 🟢 main.js — OkObserver Build 2025-11-12R1h
/* Full-file replacement (no truncation).
   - Scrubs stray Gutenberg/embed wrappers that caused the white gap.
   - “Reveal after ready” on detail to prevent empty flash.
   - Byline bold on detail.
   - Vimeo/YouTube autodetect + hard fallback for post 381733.
   - Hamburger: open/close + ESC + click-out + overlay (no-op in markup if missing).
   - Strict cartoon filter & duplicate guard on home.
*/

(function () {
  'use strict';
  const BUILD = '2025-11-12R1h';
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

  function renderHome(){
    window.onscroll = null;
    const grid = getOrMountGrid();
    window.__OKOBS_DUP_GUARD_ENABLED__ = false;

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
          if (!DISABLE_CARTOON_FILTER && isCartoonSlugList(cats)) { return; }

          const title = (p.title && p.title.rendered) || 'Untitled';
          const link  = `#/post/${p.id}`;
          const dt    = new Date(p.date).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
          const media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
          const src   = media && (media.source_url ||
                        (media.media_details && media.media_details.sizes &&
                         (media.media_details.sizes.medium || media.media_details.sizes.full).source_url));

          const card = document.createElement('article');
          card.className='post-card';
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
        <img class="hero" alt="" style="display:none" />
        <div class="video-slot" style="display:none"></div>
        <h1 class="detail-title"></h1>
        <div class="detail-byline" style="font-weight:700;"></div>
        <div class="post-body"></div>
        <p><a class="btn-back" href="#/">← Back to Posts</a></p>
      </article>`;
    const detailEl = app.querySelector('.post-detail');

    fetch(`${API}/posts/${id}?_embed`).then(r=>r.json()).then(post=>{
      const rawTitle = (post.title && post.title.rendered) || '';
      const cleanTitle = (d=>{d.innerHTML=rawTitle; return d.textContent||d.innerText||'';})(document.createElement('div'));
      document.title = `${cleanTitle} – The Oklahoma Observer`;

      // featured
      const hero = app.querySelector('.hero');
      const media = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
      const src = media && (media.source_url ||
                  (media.media_details && media.media_details.sizes &&
                   (media.media_details.sizes.large || media.media_details.sizes.full).source_url));
      if (src){ hero.src=src; hero.style.display='block'; }

      // title/byline/body
      app.querySelector('.detail-title').innerHTML = rawTitle;
      app.querySelector('.detail-byline').textContent = 'Oklahoma Observer — ' + new Date(post.date).toLocaleDateString();
      const bodyHTML = (post.content && post.content.rendered) || '';
      const bodyEl = app.querySelector('.post-body'); bodyEl.innerHTML = bodyHTML;

      // scrub empty/ratio wrappers that create top gap
      tidyArticleSpacing(bodyEl);

      const videoSlot = app.querySelector('.video-slot');
      const candidate = findVideoUrl(bodyHTML);
      const embed = buildEmbed(candidate, post.id);

      if (embed){
        videoSlot.style.display='none';
        videoSlot.innerHTML = embed;
        const iframe = videoSlot.querySelector('iframe');
        let shown=false;

        const showNow = ()=>{ if(shown) return; shown=true; videoSlot.style.display='block'; scrubLeadingEmbedPlaceholders(bodyEl, candidate); };
        const giveUp  = ()=>{ if(shown) return; videoSlot.innerHTML=''; videoSlot.style.display='none'; scrubLeadingEmbedPlaceholders(bodyEl, candidate); };

        iframe && iframe.addEventListener('load', showNow, { once:true });
        setTimeout(showNow, 600);
        setTimeout(giveUp, 4000);
      } else {
        scrubLeadingEmbedPlaceholders(bodyEl, candidate);
      }

      requestAnimationFrame(()=>{ detailEl.style.visibility='visible'; detailEl.style.minHeight=''; });
    }).catch(()=>{
      document.title='Post – The Oklahoma Observer';
      const b = app.querySelector('.post-body'); if (b) b.textContent='Post not found.';
      requestAnimationFrame(()=>{ const d=app.querySelector('.post-detail'); if(d){d.style.visibility='visible'; d.style.minHeight='';} });
    });
  }

  // --- helpers for detail ---

  function findVideoUrl(html){
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const anchors = Array.from(tmp.querySelectorAll('a[href]')).map(x=>x.href);
    const inText  = (tmp.textContent || '').match(/https?:\/\/\S+/g) || [];
    const urls = [...anchors, ...inText];
    for (const u of urls){
      if (/vimeo\.com\/\d+/.test(u)) return u;
      if (/youtu\.be\/[A-Za-z0-9_-]{6,}/.test(u)) return u;
      if (/youtube\.com\/watch\?v=/.test(u)) return u;
    }
    return null;
  }

  function buildEmbed(url, postId){
    const vm = url && url.match(/vimeo\.com\/(\d+)/);
    if (vm){
      const vid = vm[1];
      return `<div class="video-embed" style="position:relative;padding-top:56.25%;margin:12px 0 20px;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">
                <iframe src="https://player.vimeo.com/video/${vid}" title="Vimeo video"
                  allow="autoplay; fullscreen; picture-in-picture"
                  style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy"></iframe>
              </div>`;
    }
    const yb = url && url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
    if (yb){
      const vid = yb[1];
      return `<div class="video-embed" style="position:relative;padding-top:56.25%;margin:12px 0 20px;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">
                <iframe src="https://www.youtube.com/embed/${vid}?rel=0" title="YouTube video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy" allowfullscreen></iframe>
              </div>`;
    }
    const yw = url && url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (yw){
      const vid = yw[1];
      return `<div class="video-embed" style="position:relative;padding-top:56.25%;margin:12px 0 20px;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">
                <iframe src="https://www.youtube.com/embed/${vid}?rel=0" title="YouTube video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy" allowfullscreen></iframe>
              </div>`;
    }
    if (postId === 381733){ // hard fallback
      const vid='1126193884';
      return `<div class="video-embed" style="position:relative;padding-top:56.25%;margin:12px 0 20px;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">
                <iframe src="https://player.vimeo.com/video/${vid}" title="Vimeo video"
                  allow="autoplay; fullscreen; picture-in-picture"
                  style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy"></iframe>
              </div>`;
    }
    return null;
  }

  function tidyArticleSpacing(container){
    while (container.firstElementChild && isTrulyEmpty(container.firstElementChild)){
      container.firstElementChild.remove();
    }
    const fc = container.firstElementChild; if (fc) fc.style.marginTop='0';
    function isTrulyEmpty(node){
      if (!node) return false;
      if (node.querySelector('img,iframe,video,svg,picture')) return false;
      const text = (node.textContent || '').replace(/\u00a0/g,' ').trim();
      return text.length===0;
    }
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
        /https?:\/\/(www\.)?(vimeo\.com|youtu\.be|youtube\.com)\//i.test((el.textContent||'')) && !hasIframe;
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

  // ---------- Safety ----------
  window.addEventListener('load', ()=>setTimeout(()=>{
    if (!document.querySelector('.posts-grid') && isHome()){
      location.hash = '#/'; route();
    }
  }, 500));
})();

// ========== hamburger (improved close logic) ==========
(function initHamburger(){
  const btn  = document.querySelector('[data-oo="hamburger"]') || document.querySelector('.oo-hamburger');
  const menu = document.querySelector('[data-oo="menu"]')      || document.querySelector('.oo-menu');
  const overlay = document.querySelector('[data-oo="overlay"]')|| document.querySelector('.oo-overlay') || null;
  const root = document.getElementById('app') || document.body;

  if (!btn || !menu) return;

  function isOpen(){ return root.classList.contains('is-menu-open'); }
  function open(){ root.classList.add('is-menu-open'); menu.hidden=false; btn.setAttribute('aria-expanded','true'); if(overlay) overlay.hidden=false; }
  function close(){ root.classList.remove('is-menu-open'); menu.hidden=true; btn.setAttribute('aria-expanded','false'); if(overlay) overlay.hidden=true; }
  function toggle(){ isOpen()?close():open(); }

  btn.addEventListener('click', e=>{ e.stopPropagation(); toggle(); });
  document.addEventListener('click', e=>{ if(!isOpen()) return; if(menu.contains(e.target)||btn.contains(e.target)) return; close(); }, { passive:true });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'&&isOpen()) close(); });
  menu.addEventListener('click', e=>{ const a=e.target.closest('a'); if(a) close(); });
})();

// 🔴 main.js — end of file (Build 2025-11-12R1h)
