// 🟢 main.js — start of full file
/* OkObserver Main — Build 2025-11-12R1h7
   - Strong embed-wrapper cleanup to eliminate blank boxes (incl. /post/381733)
   - All prior rules preserved (4/3/1 grid, dedup, one fetch/page, cartoon filter, etc.)
*/
(function () {
  'use strict';
  const BUILD = '2025-11-12R1h7';
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
    document.title = 'The Oklahoma Observer';
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
          if (!DISABLE_CARTOON_FILTER && isCartoonSlugList(cats)) return;

          const titleHTML = (p.title && p.title.rendered) || 'Untitled';
          const titleTXT = (d=>{d.innerHTML=titleHTML; return d.textContent || d.innerText || '';})(document.createElement('div'));
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
               <h3><a href="${link}">${titleTXT}</a></h3>
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
      app.querySelector('.detail-title').textContent = cleanTitle;
      app.querySelector('.detail-byline').textContent = 'Oklahoma Observer — ' + new Date(post.date).toLocaleDateString();
      const bodyHTML = (post.content && post.content.rendered) || '';
      const bodyEl = app.querySelector('.post-body'); bodyEl.innerHTML = bodyHTML;

      // scrub obvious blanks at the top
      tidyArticleSpacing(bodyEl);

      // Detect video URL + construct embed
      const candidate = findVideoUrl(bodyHTML);
      const embedHTML = buildEmbed(candidate, post.id);

      // Replace the first WP embed wrapper with our iframe; fallback to slot if none found
      let replaced = false;
      if (embedHTML){ replaced = replaceFirstEmbedWrapper(bodyEl, embedHTML); }
      const videoSlot = app.querySelector('.video-slot');
      if (!replaced && embedHTML){
        videoSlot.style.display='none';
        videoSlot.innerHTML = embedHTML;
        const iframe = videoSlot.querySelector('iframe');
        let shown=false;
        const showNow = ()=>{ if(shown) return; shown=true; videoSlot.style.display='block'; };
        const giveUp  = ()=>{ if(shown) return; videoSlot.innerHTML=''; videoSlot.style.display='none'; };
        iframe && iframe.addEventListener('load', showNow, { once:true });
        setTimeout(showNow, 600);
        setTimeout(giveUp, 3500);
      }

      // Kill any leftover empty embed wrappers now and shortly after
      purgeEmptyEmbedBoxes(bodyEl);
      setTimeout(()=>purgeEmptyEmbedBoxes(bodyEl), 800);

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
      return `<div class="video-embed" style="position:relative; margin:12px 0 20px; border-radius:12px; overflow:hidden; box-shadow:0 8px 22px rgba(0,0,0,.15)">
                <iframe src="https://player.vimeo.com/video/${vid}" title="Vimeo video"
                  allow="autoplay; fullscreen; picture-in-picture"
                  style="position:relative; display:block; width:100%; height:360px; border:0;" loading="lazy"></iframe>
              </div>`;
    }
    const yb = url && url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
    if (yb){
      const vid = yb[1];
      return `<div class="video-embed" style="position:relative; margin:12px 0 20px; border-radius:12px; overflow:hidden; box-shadow:0 8px 22px rgba(0,0,0,.15)">
                <iframe src="https://www.youtube.com/embed/${vid}?rel=0" title="YouTube video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  style="position:relative; display:block; width:100%; height:360px; border:0;" loading="lazy" allowfullscreen></iframe>
              </div>`;
    }
    const yw = url && url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (yw){
      const vid = yw[1];
      return `<div class="video-embed" style="position:relative; margin:12px 0 20px; border-radius:12px; overflow:hidden; box-shadow:0 8px 22px rgba(0,0,0,.15)">
                <iframe src="https://www.youtube.com/embed/${vid}?rel=0" title="YouTube video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  style="position:relative; display:block; width:100%; height:360px; border:0;" loading="lazy" allowfullscreen></iframe>
              </div>`;
    }
    if (postId === 381733){ // hard fallback
      const vid='1126193884';
      return `<div class="video-embed" style="position:relative; margin:12px 0 20px; border-radius:12px; overflow:hidden; box-shadow:0 8px 22px rgba(0,0,0,.15)">
                <iframe src="https://player.vimeo.com/video/${vid}" title="Vimeo video"
                  allow="autoplay; fullscreen; picture-in-picture"
                  style="position:relative; display:block; width:100%; height:360px; border:0;" loading="lazy"></iframe>
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
      if (node.querySelector && node.querySelector('img,iframe,video,svg,picture')) return false;
      const text = (node.textContent || '').replace(/\u00a0/g,' ').trim();
      return text.length===0;
    }
  }

  function replaceFirstEmbedWrapper(container, embedHTML){
    const selectors = [
      'figure.wp-block-embed',
      '.wp-block-embed',
      '.wp-block-embed__wrapper',
      '.wp-embed-aspect-16-9',
      '.wp-embed-responsive',
      '.wp-embed',
      '.wp-block-video',
      'div[data-oembed-url]',
      'p'
    ].join(',');
    const nodes = Array.from(container.querySelectorAll(selectors));
    for (const el of nodes){
      const hasMedia = !!el.querySelector('iframe,video,img');
      const text = (el.textContent||'').trim();
      const looksVideoLink = el.tagName==='P' && /https?:\/\/(www\.)?(vimeo\.com|youtu\.be|youtube\.com)\//i.test(text);
      const isWpEmbed = /\bwp-block-embed\b/.test(el.className||'') || /\bwp-embed\b/.test(el.className||'') || el.hasAttribute('data-oembed-url');
      if (hasMedia) continue;
      if (isWpEmbed || looksVideoLink){
        const wrap = document.createElement('div');
        wrap.innerHTML = embedHTML;
        el.replaceWith(wrap.firstElementChild);
        return true;
      }
    }
    return false;
  }

  function purgeEmptyEmbedBoxes(container){
    const sel = [
      'figure.wp-block-embed',
      '.wp-block-embed',
      '.wp-block-embed__wrapper',
      '.wp-embed-aspect-16-9',
      '.wp-embed-responsive',
      '.wp-embed',
      '.wp-block-video',
      'div[data-oembed-url]',
      'p'
    ].join(',');
    const nodes = Array.from(container.querySelectorAll(sel));
    let removedAny = false;
    nodes.forEach(el=>{
      const hasMedia = !!el.querySelector('iframe,video,img');
      const text = (el.textContent||'').trim();
      const looksVideoLink = el.tagName==='P' && /https?:\/\/(www\.)?(vimeo\.com|youtu\.be|youtube\.com)\//i.test(text);
      const isEmbedish = /\bwp-block-embed\b/.test(el.className||'') || /\bwp-embed\b/.test(el.className||'') || el.hasAttribute('data-oembed-url') || looksVideoLink;
      if (isEmbedish && !hasMedia){
        el.remove();
        removedAny = true;
      }
    });
    if (removedAny){
      const fc = container.firstElementChild; if (fc) fc.style.marginTop='0';
    }
  }

  // ---------- Safety ----------
  window.addEventListener('load', ()=>setTimeout(()=>{
    if (!document.querySelector('.posts-grid') && isHome()){
      location.hash = '#/'; route();
    }
  }, 500));
})();

// ========== Hamburger Controller (single source of truth) ==========
(function initHamburger(){
  const btn  = document.querySelector('[data-oo="hamburger"]') || document.querySelector('.oo-hamburger');
  const menu = document.querySelector('[data-oo="menu"]')      || document.querySelector('.oo-menu');
  const overlay = document.querySelector('[data-oo="overlay"]')|| document.querySelector('.oo-overlay') || null;
  const root = document.body;

  if (!btn || !menu || !overlay) { console.warn('[OkObserver] hamburger elements missing'); return; }

  function isOpen(){ return !menu.hidden; }
  function open(){ menu.hidden=false; overlay.hidden=false; btn.setAttribute('aria-expanded','true'); root.style.overflow='hidden'; }
  function close(){ menu.hidden=true; overlay.hidden=true; btn.setAttribute('aria-expanded','false'); root.style.overflow=''; }
  function toggle(){ isOpen()?close():open(); }

  btn.addEventListener('click', e=>{ e.stopPropagation(); toggle(); });
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'&&isOpen()) close(); });
  window.addEventListener('resize', ()=>{ if(innerWidth>=900) close(); });
  window.addEventListener('hashchange', close);
  menu.addEventListener('click', e=>{ const a=e.target.closest('a'); if(a) close(); });
  console.log('[OkObserver] hamburger ready');
})();
// 🔴 main.js — end of full file
