/* 🟢 main.js — 2025-11-03 R1u (Facebook fallback to featured image) */
(function () {
  'use strict';
  window.AppVersion = '2025-11-03R1u';
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

  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});} catch { return ''; } };
  const byline = p => `${p._embedded?.author?.[0]?.name || 'Staff'} · ${fmtDate(p.date)}`;

  /* ---- cartoon filter ---- */
  const isCartoon = post => {
    const title = (post?.title?.rendered || '').toLowerCase();
    if (/\bcartoon(s)?\b/.test(title)) return true;
    const terms = (post?._embedded?.['wp:term'] || []).flat().filter(Boolean);
    return terms.some(t => (t.name||'').toLowerCase().includes('cartoon') || (t.slug||'').toLowerCase().includes('cartoon'));
  };

  /* ---- featured image helper ---- */
  const featuredSrc = post => {
    const fm = post?._embedded?.['wp:featuredmedia']?.[0];
    if (!fm) return '';
    const sz = fm.media_details?.sizes;
    const pick = sz?.medium_large?.source_url || sz?.large?.source_url || sz?.medium?.source_url || fm.source_url || fm.guid?.rendered || '';
    return pick ? `${pick}${pick.includes('?') ? '&' : '?'}cb=${post.id}` : '';
  };

  const imgHTML = post => {
    const src = featuredSrc(post);
    return src ? `<img src="${src}" alt="" decoding="async" loading="lazy" style="width:100%;height:auto;display:block;border:0;background:#fff;">` : '';
  };

  /* ---- video extraction ---- */
  const extractVideo = html => {
    const yt = html.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})|https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/i);
    if (yt) return { type:'youtube', src:`https://www.youtube.com/embed/${yt[1]||yt[2]}?rel=0` };
    const vimeo = html.match(/https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i);
    if (vimeo) return { type:'vimeo', src:`https://player.vimeo.com/video/${vimeo[1]}` };
    const fb = html.match(/https?:\/\/(?:www\.)?facebook\.com\/(?:watch\/?\?v=|[^"']+\/videos\/)([0-9]+)/i);
    if (fb) {
      const orig = fb[0].includes('watch') ? `https://www.facebook.com/watch/?v=${fb[1]}` : fb[0];
      const plugin = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(orig)}&show_text=false`;
      return { type:'facebook', src: plugin, orig };
    }
    const vid = html.match(/<video[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (vid) return { type:'video', src:vid[1] };
    return null;
  };

  /* ---- inline video (no autoplay; FB fallback image) ---- */
  const playInlineVideo = (container, playable, post) => {
    if (!playable || !container) return;
    container.innerHTML = '';

    if (playable.type === 'video') {
      const v = document.createElement('video');
      Object.assign(v, { src: playable.src, controls: true, playsInline: true });
      v.style.width = '100%'; v.style.aspectRatio = '16/9'; v.style.display = 'block';
      container.appendChild(v);
      return;
    }

    const f = document.createElement('iframe');
    Object.assign(f, {
      src: playable.src,
      allow: 'fullscreen; picture-in-picture; encrypted-media',
      frameBorder: '0',
      referrerPolicy: 'no-referrer-when-downgrade'
    });
    f.style.width = '100%'; f.style.aspectRatio = '16/9'; f.style.display = 'block';
    container.appendChild(f);

    /* ---- Facebook fallback if embed blocked ---- */
    if (playable.type === 'facebook') {
      const fbLink = playable.orig;
      const check = setTimeout(() => {
        // if frame didn't load properly (blocked), swap in featured image
        if (!f.contentWindow || f.offsetHeight < 100) {
          container.innerHTML = imgHTML(post) || '';
          const btn = document.createElement('div');
          btn.innerHTML = `<a class="button" target="_blank" rel="noopener" href="${fbLink}">View on Facebook</a>`;
          btn.style.marginTop = '8px';
          container.appendChild(btn);
        }
      }, 2000);
      f.addEventListener('error', () => {
        clearTimeout(check);
        container.innerHTML = imgHTML(post) || '';
        const btn = document.createElement('div');
        btn.innerHTML = `<a class="button" target="_blank" rel="noopener" href="${fbLink}">View on Facebook</a>`;
        btn.style.marginTop = '8px';
        container.appendChild(btn);
      });
    }
  };

  /* ---- feed + rendering ---- */
  const remember = (k,v)=>{ if(cachePages.has(k)){const i=lru.indexOf(k);if(i>-1)lru.splice(i,1);} cachePages.set(k,v);lru.push(k);while(lru.length>6)cachePages.delete(lru.shift()); };
  const ensureFeed = ()=>{ let f=document.querySelector('.posts-grid'); if(!f){f=document.createElement('div');f.className='posts-grid';app.innerHTML='';app.appendChild(f);} return f; };
  const trimCards = ()=>{ const c=document.querySelector('.posts-grid'); if(!c)return; while(c.children.length>MAX_CARDS)c.removeChild(c.firstElementChild); };
  const cardHTML = p => `
    <article class="post-card" data-id="${p.id}">
      <a class="title-link" href="#/post/${p.id}">
        <div class="thumb">${imgHTML(p)}</div>
        <h2 class="post-title">${p.title?.rendered || ''}</h2>
      </a>
      <div class="byline">${byline(p)}</div>
      <div class="post-summary">${p.excerpt?.rendered || ''}</div>
    </article>`;
  const renderPage = posts => {
    const feed = ensureFeed();
    const frag = document.createDocumentFragment();
    posts.forEach(p=>{
      const wrap=document.createElement('div');
      wrap.innerHTML=cardHTML(p);
      const card=wrap.firstElementChild;
      card.style.opacity='0'; card.style.transition='opacity .3s ease';
      frag.appendChild(card);
      requestAnimationFrame(()=>card.style.opacity='1');
    });
    feed.appendChild(frag);
    trimCards();
  };

  /* ---- tags ---- */
  const tagsHTML = p => {
    const groups = p?._embedded?.['wp:term'] || [];
    const terms = groups.flat().filter(t => t && (t.taxonomy==='post_tag'||t.taxonomy==='category'));
    if (!terms.length) return '';
    const seen=new Set(), chips=[];
    for(const t of terms){if(seen.has(t.id))continue;seen.add(t.id);
      const name=(t.name||'').trim();if(!name)continue;
      const lower=name.toLowerCase();if(lower.includes('cartoon'))continue;
      chips.push(`<span class="tag-chip" title="${t.taxonomy}">${name}</span>`);
    }
    return chips.length?`<div class="post-tags">${chips.join('')}</div>`:'';
  };

  /* ---- detail ---- */
  const renderDetail = async id=>{
    app.innerHTML='<div>Loading…</div>';
    try{
      const r=await fetch(`${API_BASE}/posts/${id}?_embed=1`);
      const p=await r.json();
      const playable=extractVideo(p.content?.rendered||'');
      const hero=`<div class="post-hero" style="margin:0 0 16px 0;"><div class="thumb">${imgHTML(p)}</div></div>`;
      const tagsBlock=tagsHTML(p);
      app.innerHTML=`<article class="post-detail">
        ${hero}
        <h1 class="post-detail__title" style="color:#1E90FF;margin:0 0 8px;">${p.title?.rendered||''}</h1>
        <div class="byline" style="font-weight:600;margin:0 0 16px;">${byline(p)}</div>
        <div class="post-detail__content">${p.content?.rendered||''}</div>
        ${tagsBlock?`<div class="tags-row" style="margin:16px 0;">${tagsBlock}</div>`:''}
        <p style="margin-top:24px;"><a class="button" href="#/">Back to Posts</a></p>
      </article>`;
      if(playable){
        const ph=app.querySelector('.post-hero .thumb');
        playInlineVideo(ph,playable,p);
      }
    }catch{app.innerHTML='<div>Failed to load post.</div>';}
  };

  /* ---- data + router ---- */
  const fetchPosts = async n=>{
    const r=await fetch(`${API_BASE}/posts?per_page=${PAGE_SIZE}&page=${n}&_embed=1`);
    if(!r.ok){if(r.status===400||r.status===404)reachedEnd=true;throw new Error(r.status);}
    const posts=await r.json();
    return posts.filter(p=>!isCartoon(p));
  };
  const loadNext = async ()=>{
    if(loading||reachedEnd||route!=='home')return;
    loading=true;
    try{const posts=await fetchPosts(page);
      if(!posts.length){reachedEnd=true;return;}
      remember(page,posts);renderPage(posts);page+=1;
    }finally{loading=false;}
  };
  const router = async ()=>{
    const parts=(location.hash||'#/').slice(2).split('/');
    switch(parts[0]){
      case '':
      case 'posts':route='home';const f=ensureFeed();if(!f.children.length){page=1;reachedEnd=false;loading=false;f.innerHTML='';io.observe(sentinel);await loadNext();}break;
      case 'about':route='about';app.innerHTML='<h1>About</h1>';break;
      case 'post':route='detail';return renderDetail(parts[1]);
      default:route='home';ensureFeed();break;
    }
  };
  const io=new IntersectionObserver(async e=>{if(e[0].isIntersecting&&!loading)await loadNext();},{rootMargin:'1200px 0px 800px 0px'});
  hamburger?.addEventListener('click',()=>menu.toggleAttribute('hidden'));
  addEventListener('hashchange',router);
  router().then(()=>{if(route==='home')io.observe(sentinel);});
})();
 /* 🔴 main.js */
