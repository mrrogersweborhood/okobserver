/* 🟢 main.js — 2025-11-03 R1y
   - Restore feed DOM + scroll when returning from detail
   - Robust post 404 page (no fallback to home)
   - Infinite scroll hardened
   - Facebook blocked embed → featured image + "View on Facebook"
   - Tags at bottom; byline bold; no autoplay
   - Cartoon posts filtered from feed
*/
(function () {
  'use strict';
  window.AppVersion = '2025-11-03R1y';
  console.log('[OkObserver] main.js', window.AppVersion);

  const API_BASE  = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PAGE_SIZE = 12;
  const MAX_CARDS = 60;

  // runtime state (non-persistent)
  let page = 1, loading = false, reachedEnd = false, route = 'home';

  // DOM
  const app       = document.getElementById('app');
  const sentinel  = document.getElementById('sentinel');
  const menu      = document.getElementById('menu');
  const hamburger = document.getElementById('hamburger');

  // small LRU for API pages (in-memory)
  const cachePages = new Map(); const lru = [];

  // session persistence keys (per-tab)
  const SS = {
    FEED_HTML: 'okob.feed.html',
    FEED_PAGE: 'okob.feed.page',
    FEED_END : 'okob.feed.end',
    SCROLL_Y : 'okob.feed.scrollY',
  };

  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});} catch { return ''; } };
  const byline  = p => `${p._embedded?.author?.[0]?.name || 'Staff'} · ${fmtDate(p.date)}`;

  /* ---------- filters / media helpers ---------- */
  const isCartoon = post => {
    const title = (post?.title?.rendered || '').toLowerCase();
    if (/cartoon/.test(title)) return true;
    const groups = post?._embedded?.['wp:term'] || [];
    const terms  = groups.flat().filter(Boolean);
    return terms.some(t => {
      const n = (t.name||'').toLowerCase();
      const s = (t.slug||'').toLowerCase();
      return n.includes('cartoon') || s.includes('cartoon');
    });
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
    return src ? `<img src="${src}" alt="" decoding="async" loading="lazy" style="width:100%;height:auto;display:block;border:0;background:#fff;">` : '';
  };

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

    // FB fallback: swap to featured image + button if blocked
    if (playable.type === 'facebook') {
      const fbLink = playable.orig;
      const fallback = () => {
        container.innerHTML = imgHTML(post) || '';
        const btn = document.createElement('div');
        btn.innerHTML = `<a class="button" target="_blank" rel="noopener" href="${fbLink}">View on Facebook</a>`;
        btn.style.marginTop = '8px';
        container.appendChild(btn);
      };
      const check = setTimeout(() => {
        if (!f.contentWindow || f.offsetHeight < 100) fallback();
      }, 2000);
      f.addEventListener('error', () => { clearTimeout(check); fallback(); });
    }
  };

  /* ---------- feed rendering ---------- */
  const remember = (k,v)=>{ if(cachePages.has(k)){const i=lru.indexOf(k);if(i>-1)lru.splice(i,1);} cachePages.set(k,v);lru.push(k);while(lru.length>6)cachePages.delete(lru.shift()); };
  const ensureFeed = ()=>{ let feed=document.querySelector('.posts-grid'); if(!feed){feed=document.createElement('div');feed.className='posts-grid';app.innerHTML='';app.appendChild(feed);} return feed; };
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
      const wrap=document.createElement('div'); wrap.innerHTML=cardHTML(p);
      const card=wrap.firstElementChild; card.style.opacity='0'; card.style.transition='opacity .3s ease';
      frag.appendChild(card); requestAnimationFrame(()=>{card.style.opacity='1';});
    });
    feed.appendChild(frag);
    trimCards();
    document.body.appendChild(sentinel); // keep sentinel after content
  };

  /* ---------- detail helpers ---------- */
  const tagsHTML = p => {
    const groups = p?._embedded?.['wp:term'] || [];
    const terms = groups.flat().filter(t => t && (t.taxonomy==='post_tag'||t.taxonomy==='category'));
    if (!terms.length) return '';
    const seen=new Set(), chips=[];
    for(const t of terms){
      if(seen.has(t.id)) continue; seen.add(t.id);
      const name=(t.name||'').trim(); if(!name) continue;
      if (name.toLowerCase().includes('cartoon')) continue;
      chips.push(`<span class="tag-chip" title="${t.taxonomy}">${name}</span>`);
    }
    return chips.length ? `<div class="post-tags">${chips.join('')}</div>` : '';
  };

  /* ---------- views ---------- */
  const renderAbout = ()=>{ app.innerHTML=`<section><h1>About The Oklahoma Observer</h1><p>Independent journalism since 1969. Tips: <a href="mailto:okobserver@outlook.com">okobserver@outlook.com</a></p></section>`; };

  const notFound = (id, statusText='Not found') => {
    app.innerHTML = `
      <article class="post-detail" style="max-width:880px;margin:0 auto;padding:0 12px;">
        <h1 class="post-detail__title" style="color:#1E90FF;margin:0 0 8px;">Post not found</h1>
        <div class="byline" style="font-weight:600;margin:0 0 16px;">ID ${id} • ${statusText}</div>
        <p>We couldn’t load this article. It may have been removed or is restricted.</p>
        <p style="margin-top:24px;"><a class="button" href="#/">Back to Posts</a></p>
      </article>`;
  };

  const renderDetail = async id=>{
    // Save scroll position before leaving feed
    try { sessionStorage.setItem(SS.SCROLL_Y, String(window.scrollY||0)); } catch {}
    app.innerHTML='<div>Loading…</div>';
    try{
      const r=await fetch(`${API_BASE}/posts/${id}?_embed=1`);
      if (!r.ok) { notFound(id, `HTTP ${r.status}`); return; }
      const p=await r.json();
      if (!p || !p.id) { notFound(id, 'Unavailable'); return; }

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

      if (playable) {
        const ph=app.querySelector('.post-hero .thumb');
        playInlineVideo(ph,playable,p);
      }
    } catch (e) {
      console.warn('Post load failed', e);
      notFound(id, 'Network error');
    }
  };

  /* ---------- data ---------- */
  const fetchPosts = async n=>{
    const r=await fetch(`${API_BASE}/posts?per_page=${PAGE_SIZE}&page=${n}&_embed=1`);
    if(!r.ok){ if(r.status===400||r.status===404) reachedEnd=true; throw new Error(r.status); }
    const posts=await r.json();
    return posts.filter(p=>!isCartoon(p));
  };

  /* ---------- infinite scroll (robust) ---------- */
  let io;
  const attachObserver = () => {
    if (io) io.disconnect();
    io = new IntersectionObserver(async entries => {
      const e = entries[0];
      if (!e.isIntersecting || loading || reachedEnd || route !== 'home') return;
      await loadNext();
    }, { root: null, rootMargin: '1400px 0px 1000px 0px', threshold: 0 });

    if (!document.body.contains(sentinel)) document.body.appendChild(sentinel);
    io.observe(sentinel);
  };

  const loadNext = async ()=>{
    if (loading || reachedEnd || route!=='home') return;
    loading = true;
    try{
      const posts = await fetchPosts(page);
      if (!posts.length) { reachedEnd = true; return; }
      remember(page, posts);
      renderPage(posts);
      page += 1;
      if (document.documentElement.scrollHeight <= window.innerHeight + 200 && !reachedEnd) {
        (window.requestIdleCallback || setTimeout)(() => loadNext(), 50);
      }
      // Snapshot feed state after render
      snapshotFeed();
    } finally { loading = false; }
  };

  /* ---------- feed snapshot / restore ---------- */
  const snapshotFeed = () => {
    try {
      const feed = document.querySelector('.posts-grid');
      if (!feed) return;
      sessionStorage.setItem(SS.FEED_HTML, feed.innerHTML);
      sessionStorage.setItem(SS.FEED_PAGE, String(page));
      sessionStorage.setItem(SS.FEED_END,  String(reachedEnd));
    } catch {}
  };

  const restoreFeedIfAvailable = () => {
    try {
      const html = sessionStorage.getItem(SS.FEED_HTML);
      if (!html) return false;
      const savedPage = Number(sessionStorage.getItem(SS.FEED_PAGE)||'1');
      const savedEnd  = sessionStorage.getItem(SS.FEED_END)==='true';
      const feed = ensureFeed();
      feed.innerHTML = html;
      page = Math.max(1, savedPage);
      reachedEnd = !!savedEnd;
      // Re-attach click handlers are not needed because cards are plain anchors.
      // Restore scroll after next frame so layout is settled
      requestAnimationFrame(() => {
        const y = Number(sessionStorage.getItem(SS.SCROLL_Y)||'0');
        window.scrollTo({ top: y, behavior: 'instant' in window ? 'instant' : 'auto' });
      });
      // Ensure sentinel is observed again
      attachObserver();
      // If we restored to a short page and not at end, load more
      if (document.documentElement.scrollHeight <= window.innerHeight + 200 && !reachedEnd) {
        (window.requestIdleCallback || setTimeout)(() => loadNext(), 50);
      }
      return true;
    } catch { return false; }
  };

  /* ---------- router ---------- */
  const router = async ()=>{
    const parts=(location.hash||'#/').slice(2).split('/');
    switch(parts[0]){
      case '':
      case 'posts': {
        route='home';
        // Try to restore feed and position; if no snapshot, do a fresh mount
        if (!restoreFeedIfAvailable()) {
          const feed=ensureFeed();
          page=1; reachedEnd=false; loading=false;
          feed.innerHTML='';
          attachObserver();
          await loadNext();
        }
        break;
      }
      case 'about':
        route='about'; if (io) io.disconnect(); renderAbout(); break;
      case 'settings':
        route='settings'; if (io) io.disconnect();
        app.innerHTML = `<section><h1>Settings</h1><p>Build <strong>${window.AppVersion}</strong></p></section>`;
        break;
      case 'post':
        route='detail'; if (io) io.disconnect();
        await renderDetail(parts[1]); break;
      default:
        route='home'; ensureFeed(); attachObserver(); break;
    }
  };

  /* ---------- UI ---------- */
  hamburger?.addEventListener('click',()=>{
    if (menu.hasAttribute('hidden')) { menu.removeAttribute('hidden'); hamburger.setAttribute('aria-expanded','true'); }
    else { menu.setAttribute('hidden',''); hamburger.setAttribute('aria-expanded','false'); }
  });

  addEventListener('hashchange', router);
  addEventListener('beforeunload', snapshotFeed); // snapshot if user reloads

  // boot
  (async ()=>{ await router(); if(route==='home') attachObserver(); })();
})();
 /* 🔴 main.js */
