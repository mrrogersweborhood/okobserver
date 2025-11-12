// 🟢 Full file: main.js v2025-11-11R1g • Tight cartoon filter + render diagnostics + override hook
(function () {
  'use strict';
  const BUILD = '2025-11-11R1g';
  console.log('[OkObserver] Main JS Build', BUILD);

  const API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  let app = document.getElementById('app');

  // Router
  window.addEventListener('hashchange', route);
  window.addEventListener('load', route);
  function route() {
    const hash = location.hash || '#/';
    console.log('[OkObserver] route()', hash);
    if (hash.startsWith('#/post/')) renderDetail(+hash.split('/')[2]);
    else if (hash.startsWith('#/about')) renderAbout();
    else renderHome();
    document.dispatchEvent(new CustomEvent('okobs:route', { detail:{ hash } }));
  }
  window.__ok_route = h => { if (h) location.hash=h; route(); };

  // Home state
  const paging = { page:1, busy:false, done:false };
  let DISABLE_CARTOON_FILTER = false; // can be toggled from console

  // Expose override so we can prove rendering
  window.__ok_disableCartoonFilter = function(on=true){
    DISABLE_CARTOON_FILTER = !!on;
    console.warn('[OkObserver] Cartoon filter disabled =', DISABLE_CARTOON_FILTER, '— refreshing home…');
    location.hash = '#/'; route();
  };

  function ensureGrid(){
    let grid = app && app.querySelector('.posts-grid');
    if (!grid) {
      if (!app) app = document.getElementById('app');
      if (!app) { console.error('[OkObserver] #app missing'); return null; }
      grid = document.createElement('section');
      grid.className = 'posts-grid';
      app.innerHTML = '';
      app.appendChild(grid);
    }
    return grid;
  }

  function renderHome(){
    console.log('[OkObserver] renderHome() start');
    window.onscroll = null;
    const grid = ensureGrid(); if (!grid) return;
    paging.page = 1; paging.busy = false; paging.done = false;
    loadMore();
    window.onscroll = onScroll;
  }

  function onScroll(){
    if (paging.busy || paging.done) return;
    const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 1000);
    if (nearBottom) loadMore();
  }

  function loadMore(){
    const grid = ensureGrid(); if (!grid) return;
    if (paging.busy || paging.done) return;
    paging.busy = true;
    console.log('[OkObserver] loadMore page', paging.page);

    fetch(`${API}/posts?_embed&per_page=12&page=${paging.page}`)
      .then(r => {
        console.log('[OkObserver] posts status', r.status);
        if (!r.ok){ if (r.status===400 || r.status===404) paging.done = true; throw new Error('no more'); }
        return r.json();
      })
      .then(arr => {
        console.log('[OkObserver] received posts:', arr.length);
        let skipped = 0, rendered = 0;
        const preview = [];

        arr.forEach(p=>{
          const cats = (p._embedded && p._embedded['wp:term'] && p._embedded['wp:term'][0]) || [];
          const isCartoon = !DISABLE_CARTOON_FILTER && cats.some(c => (c.slug||'').toLowerCase() === 'cartoon');
          if (isCartoon){ skipped++; return; }

          // prepare preview list (first 3)
          if (preview.length < 3) preview.push((p.title && p.title.rendered) || 'Untitled');

          const link = `#/post/${p.id}`;
          const title = (p.title && p.title.rendered) || 'Untitled';
          const dt = new Date(p.date).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
          const media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
          const src = media && (media.source_url || (media.media_details && media.media_details.sizes && (media.media_details.sizes.medium || media.media_details.sizes.full).source_url));

          const card = document.createElement('article');
          card.className = 'post-card';
          card.setAttribute('data-post-id', p.id);
          card.innerHTML =
            (src ? `<a href="${link}"><img class="thumb" alt="" loading="lazy" src="${src}"></a>` : '') +
            `<div class="pad">
               <h3><a href="${link}">${title}</a></h3>
               <div class="byline">Oklahoma Observer — ${dt}</div>
               <div class="excerpt">${(p.excerpt && p.excerpt.rendered) || ''}</div>
             </div>`;
          grid.appendChild(card);
          rendered++;
        });

        console.log(`[OkObserver] render summary — rendered: ${rendered}, skipped(cartoon): ${skipped}, preview:`, preview);

        paging.page += 1;
        paging.busy = false;
        if (arr.length === 0 || rendered === 0) {
          // If nothing actually rendered, avoid infinite loop
          paging.done = true;
        }
        console.log('[OkObserver] loadMore complete; next page', paging.page, 'done?', paging.done);
      })
      .catch(err=>{
        console.warn('[OkObserver] loadMore error', err);
        paging.busy = false; paging.done = true;
      });
  }
  window.__ok_loadMore = ()=>{ try{ loadMore(); }catch(e){ console.error(e);} };

  function renderAbout(){
    window.onscroll=null;
    app.innerHTML = '<div class="post-detail"><h1>About</h1><p>The Oklahoma Observer…</p></div>';
    document.title = 'About – The Oklahoma Observer';
  }

  function renderDetail(id){
    window.onscroll=null;
    app.innerHTML = `
      <article class="post-detail">
        <img class="hero" alt="" style="display:none" />
        <h1 class="detail-title"></h1>
        <div class="detail-byline"></div>
        <div class="post-body"></div>
        <p><a class="btn-back" href="#/">← Back to Posts</a></p>
      </article>`;

    fetch(`${API}/posts/${id}?_embed`)
      .then(r=>r.json())
      .then(post=>{
        const rawTitle = (post.title && post.title.rendered) || '';
        const clean = (function(h){ const d=document.createElement('div'); d.innerHTML=h; return d.textContent||d.innerText||'';})(rawTitle);
        document.title = `${clean} – The Oklahoma Observer`;

        const hero = app.querySelector('.hero');
        const media = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
        const src = media && (media.source_url || (media.media_details && media.media_details.sizes && (media.media_details.sizes.large || media.media_details.sizes.full).source_url));
        if (src){ hero.src = src; hero.style.display='block'; }

        app.querySelector('.detail-title').innerHTML = rawTitle;
        app.querySelector('.detail-byline').textContent = 'Oklahoma Observer — ' + new Date(post.date).toLocaleDateString();
        app.querySelector('.post-body').innerHTML = (post.content && post.content.rendered) || 'Post loaded.';
      })
      .catch(()=>{
        document.title='Post – The Oklahoma Observer';
        const b=app.querySelector('.post-body'); if(b) b.textContent='Post not found.';
      });
  }

  // Safety: if home grid missing shortly after load, force home once
  window.addEventListener('load', ()=>setTimeout(()=>{
    if (!document.querySelector('.posts-grid') && ((location.hash||'#/')==='#/')) {
      console.warn('[OkObserver] forcing home route'); location.hash='#/'; route();
    }
  }, 500));
})();

/* ======== helpers (unchanged behavior) ======== */
(function initHamburger(){var b=document.querySelector('[data-oo="hamburger"]')||document.querySelector('.oo-hamburger');var m=document.querySelector('[data-oo="menu"]')||document.querySelector('.oo-menu');if(!b||!m){console.debug('[OkObserver] hamburger hooks not found — noop');return;}var t=document.getElementById('app')||document.body;var o=()=>t.classList.add('is-menu-open'),c=()=>t.classList.remove('is-menu-open'),i=()=>t.classList.contains('is-menu-open');b.addEventListener('click',e=>{e.stopPropagation();i()?c():o();});document.addEventListener('click',e=>{if(!i())return;if(m.contains(e.target)||b.contains(e.target))return;c();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&i())c();});console.debug('[OkObserver] hamburger ready');})();
(function dupGuard(){var s=new Set(),a;function scan(r,g){(r||g).querySelectorAll('.post-card').forEach(c=>{var id=c.getAttribute('data-post-id');if(!id){var ah=c.querySelector('a[href*="#/post/"]');if(ah){var m=ah.getAttribute('href').match(/#\/post\/(\d+)/);if(m)id=m[1];}}if(!id)return;if(s.has(id))c.remove();else s.add(id);});}
function attach(){var g=document.querySelector('#app .posts-grid');if(!g||a===g)return;a=g;scan(g,g);var mo=new MutationObserver(m=>m.forEach(x=>x.addedNodes&&x.addedNodes.forEach(n=>{if(n.nodeType!==1)return;if(n.classList&&n.classList.contains('post-card'))scan(n.parentNode,g);else if(n.querySelectorAll)scan(n,g);})));mo.observe(g,{childList:true,subtree:true});console.debug('[OkObserver] duplicate guard active');}
attach();document.addEventListener('okobs:route',e=>{if(!e.detail)return;var h=e.detail.hash;if(h.indexOf('#/post/')===0||h.indexOf('#/about')===0)return;setTimeout(attach,0);});})();
