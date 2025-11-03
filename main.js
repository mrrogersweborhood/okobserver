/* 🟢 main.js — 2025-11-03R1p (Grid layout compatible; no autoplay; smooth insert) */
(function () {
  'use strict';
  window.AppVersion = '2025-11-03R1p';
  console.log('[OkObserver] main.js', window.AppVersion);

  const API_BASE  = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PAGE_SIZE = 12;
  const MAX_CARDS = 60;

  let page = 1, loading = false, reachedEnd = false, route = 'home';
  const cachePages = new Map(), lru = [];

  const app = document.getElementById('app');
  const sentinel = document.getElementById('sentinel');
  const menu = document.getElementById('menu');
  const hamburger = document.getElementById('hamburger');

  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});} catch { return ''; } };
  const byline = p => `${p._embedded?.author?.[0]?.name || 'Staff'} · ${fmtDate(p.date)}`;

  const isCartoon = post => {
    const title = (post?.title?.rendered || '').toLowerCase();
    if (/\bcartoon(s)?\b/.test(title)) return true;
    const terms = (post?._embedded?.['wp:term'] || []).flat().filter(Boolean);
    return terms.some(t => (t.name||'').toLowerCase().includes('cartoon') || (t.slug||'').toLowerCase().includes('cartoon'));
  };

  const featuredSrc = post => {
    const fm = post?._embedded?.['wp:featuredmedia']?.[0];
    if (!fm) return '';
    const sz = fm.media_details?.sizes;
    const pick = sz?.medium_large?.source_url || sz?.large?.source_url || sz?.medium?.source_url || fm.source_url || fm.guid?.rendered || '';
    return pick ? `${pick}${pick.includes('?') ? '&' : '?'}cb=${post.id}` : '';
  };

  const imgHTML = post => {
    const src = featuredSrc(post);
    if (!src) return '';
    return `<img src="${src}" alt="" decoding="async" loading="lazy" style="width:100%;height:auto;display:block;border:0;background:#fff;">`;
  };

  // ---- video extraction for detail (autoplay removed) ----
  const extractVideo = html => {
    const yt = html.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})|https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/i);
    if (yt) return { type:'youtube', src:`https://www.youtube.com/embed/${yt[1]||yt[2]}?rel=0` };
    const vimeo = html.match(/https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i);
    if (vimeo) return { type:'vimeo', src:`https://player.vimeo.com/video/${vimeo[1]}` };
    const fb = html.match(/https?:\/\/(?:www\.)?facebook\.com\/(?:watch\/?\?v=|[^"']+\/videos\/)([0-9]+)/i);
    if (fb) {
      const orig = fb[0].includes('watch') ? `https://www.facebook.com/watch/?v=${fb[1]}` : fb[0];
      return { type:'facebook', src:`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(orig)}&show_text=false` };
    }
    const vid = html.match(/<video[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (vid) return { type:'video', src:vid[1] };
    return null;
  };

  // ---- inline video (no autoplay, responsive) ----
  const playInlineVideo = (container, playable) => {
    if (!playable || !container) return;
    container.innerHTML = '';
    if (playable.type === 'video') {
      const v = document.createElement('video');
      Object.assign(v, { src: playable.src, controls: true, playsInline: true });
      v.style.width = '100%'; v.style.display = 'block'; v.style.aspectRatio = '16 / 9';
      container.appendChild(v);
    } else {
      const f = document.createElement('iframe');
      Object.assign(f, {
        src: playable.src,
        allow: 'fullscreen; picture-in-picture; encrypted-media',
        frameBorder: '0',
        referrerPolicy: 'no-referrer-when-downgrade'
      });
      f.style.width = '100%'; f.style.display = 'block'; f.style.aspectRatio = '16 / 9';
      container.appendChild(f);
    }
  };

  // ---- feed helpers ----
  const remember = (k,v)=>{ if(cachePages.has(k)){const i=lru.indexOf(k);if(i>-1)lru.splice(i,1);} cachePages.set(k,v);lru.push(k);while(lru.length>6)cachePages.delete(lru.shift()); };
  const ensureFeed = ()=>{ let feed=document.querySelector('.posts-grid'); if(!feed){feed=document.createElement('div');feed.className='posts-grid';app.innerHTML='';app.appendChild(feed);} return feed; };
  const trimCards = ()=>{ const c=document.querySelector('.posts-grid'); if(!c)return; while(c.children.length>MAX_CARDS)c.removeChild(c.firstElementChild); };

  // ---- cards (summary: image only) ----
  const cardHTML = p => `
    <article class="post-card" data-id="${p.id}">
      <a class="title-link" href="#/post/${p.id}">
        <div class="thumb">${imgHTML(p)}</div>
        <h2 class="post-title">${p.title?.rendered || ''}</h2>
        <div class="byline">${byline(p)}</div>
        <div class="post-summary">${p.excerpt?.rendered || ''}</div>
      </a>
    </article>`;

  // ---- renderPage (fade-in; no column hacks needed with Grid) ----
  const renderPage = posts => {
    const feed = ensureFeed();
    const frag = document.createDocumentFragment();
    posts.forEach(p=>{
      const wrap=document.createElement('div');
      wrap.innerHTML=cardHTML(p);
      const card=wrap.firstElementChild;
      card.style.opacity='0';
      card.style.transition='opacity 0.3s ease';
      frag.appendChild(card);
      requestAnimationFrame(()=>{card.style.opacity='1';});
    });
    feed.appendChild(frag);
    trimCards();
  };

  const renderAbout = ()=>{app.innerHTML=`<section><h1>About The Oklahoma Observer</h1><p>Independent journalism since 1969. Tips: <a href="mailto:okobserver@outlook.com">okobserver@outlook.com</a></p></section>`;};
  const renderSettings = ()=>{app.innerHTML=`<section><h1>Settings</h1><p>Build <strong>${window.AppVersion}</strong></p></section>`;};

  // ---- detail view ----
  const renderDetail = async id=>{
    app.innerHTML='<div>Loading…</div>';
    try{
      const r=await fetch(`${API_BASE}/posts/${id}?_embed=1`);
      const p=await r.json();
      const playable=extractVideo(p.content?.rendered||'');
      const hero=`<div class="post-hero" style="position:relative;margin:0 0 16px 0;"><div class="thumb">${imgHTML(p)}</div></div>`;
      app.innerHTML=`<article class="post-detail">
          ${hero}
          <h1 class="post-detail__title" style="margin:0 0 8px 0;">${p.title?.rendered||''}</h1>
          <div class="byline" style="margin:0 0 16px 0;">${byline(p)}</div>
          <div class="post-detail__content">${p.content?.rendered||''}</div>
          <p style="margin-top:24px;"><a class="button" href="#/">Back to Posts</a></p>
        </article>`;
      if(playable){
        const ph=app.querySelector('.post-hero .thumb');
        playInlineVideo(ph,playable);
      }
    }catch{app.innerHTML='<div>Failed to load post.</div>';}
  };

  // ---- data + router ----
  const fetchPosts = async n=>{
    const r=await fetch(`${API_BASE}/posts?per_page=${PAGE_SIZE}&page=${n}&_embed=1`);
    if(!r.ok){if(r.status===400||r.status===404)reachedEnd=true;throw new Error(r.status);}
    const posts=await r.json();
    return posts.filter(p=>!isCartoon(p));
  };

  const loadNext = async ()=>{
    if(loading||reachedEnd||route!=='home')return;
    loading=true;
    try{
      const posts=await fetchPosts(page);
      if(!posts.length){reachedEnd=true;return;}
      remember(page,posts);
      renderPage(posts);
      page+=1;
    }finally{loading=false;}
  };

  const router = async ()=>{
    const parts=(location.hash||'#/').slice(2).split('/');
    switch(parts[0]){
      case '':
      case 'posts':{
        route='home';
        const feed=ensureFeed();
        if(!feed.children.length){
          page=1;reachedEnd=false;loading=false;
          feed.innerHTML='';
          io.observe(sentinel);
          await loadNext();
        }
        break;
      }
      case 'about':route='about';return renderAbout();
      case 'settings':route='settings';return renderSettings();
      case 'post':route='detail';return renderDetail(parts[1]);
      default:route='home';ensureFeed();break;
    }
  };

  const io=new IntersectionObserver(async e=>{
    if(!e[0].isIntersecting||loading)return;
    await loadNext();
  },{rootMargin:'1200px 0px 800px 0px',threshold:0});

  const toggleMenu=()=>{const open=!menu.hasAttribute('hidden');if(open){menu.setAttribute('hidden','');hamburger.setAttribute('aria-expanded','false');}else{menu.removeAttribute('hidden');hamburger.setAttribute('aria-expanded','true');}};
  const start=async()=>{addEventListener('hashchange',router);hamburger?.addEventListener('click',toggleMenu);await router();if(route==='home'){io.observe(sentinel);await loadNext();}};
  start();
})();
 /* 🔴 main.js */
