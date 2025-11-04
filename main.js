/* 🟢 main.js — 2025-11-03 R1ac
   - Sanitize post HTML: remove empty anchors, unwrap image-only anchors, normalize captions
   - Robust video detection (finds links in captions/attributes)
   - Resilient infinite scroll (IO + timer + near-bottom kick)
   - Restore feed DOM + scroll when returning from detail
   - Robust post 404 page (no fallback to home)
   - Facebook: always featured image + "View on Facebook" (no iframe)
   - Tags at bottom; byline bold; no autoplay
   - Cartoon posts filtered from feed
*/
(function () {
  'use strict';
  window.AppVersion = '2025-11-03R1ac';
  console.log('[OkObserver] main.js', window.AppVersion);

  const API_BASE  = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PAGE_SIZE = 12;
  const MAX_CARDS = 60;

  let page = 1, loading = false, reachedEnd = false, route = 'home';
  const app       = document.getElementById('app');
  const sentinel  = document.getElementById('sentinel');
  const menu      = document.getElementById('menu');
  const hamburger = document.getElementById('hamburger');

  const cachePages = new Map(); const lru = [];
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

  /* ---------- Video extraction (caption/attribute aware) ---------- */
  const decodeEntities = (s='') => {
    try { const el=document.createElement('textarea'); el.innerHTML=s; return el.value; }
    catch { return s; }
  };
  const findUrls = (raw='') => {
    const txt = decodeEntities(raw);
    const urls = []; const re = /https?:\/\/[^\s"'<>)]+/gi; let m;
    while ((m = re.exec(txt))) urls.push(m[0]);
    return urls;
  };
  const extractVideo = html => {
    const urls = findUrls(html);

    const vimeo = urls.find(u => /\/\/(?:www\.)?vimeo\.com\/(\d+)/i.test(u));
    if (vimeo) { const id = (vimeo.match(/vimeo\.com\/(\d+)/i)||[])[1]; if (id) return { type:'vimeo', src:`https://player.vimeo.com/video/${id}` }; }

    const ytu = urls.find(u => /youtube\.com\/watch\?v=|youtu\.be\//i.test(u));
    if (ytu) {
      const id = (ytu.match(/v=([A-Za-z0-9_-]{11})/)||[])[1] || (ytu.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)||[])[1];
      if (id) return { type:'youtube', src:`https://www.youtube.com/embed/${id}?rel=0` };
    }

    const fbu = urls.find(u => /facebook\.com\/(?:watch\/?\?v=|.*\/videos\/\d+)/i.test(u));
    if (fbu) return { type:'facebook', src:'', orig: fbu };

    const vid = html.match(/<video[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (vid) return { type:'video', src:vid[1] };

    return null;
  };

  // ---- inline media (NO FB iframe; always image + link) ----
  const playInlineVideo = (container, playable, post) => {
    if (!playable || !container) return;
    container.innerHTML = '';

    if (playable.type === 'facebook') {
      container.innerHTML = imgHTML(post) || '';
      const btn = document.createElement('div');
      btn.style.marginTop = '8px';
      btn.innerHTML = `<a class="button" target="_blank" rel="noopener" href="${playable.orig || '#'}">View on Facebook</a>`;
      container.appendChild(btn);
      return;
    }

    if (playable.type === 'video') {
      const v = document.createElement('video');
      Object.assign(v, { src: playable.src, controls: true, playsInline: true });
      v.style.width = '100%'; v.style.aspectRatio = '16/9'; v.style.display = 'block';
      container.appendChild(v);
      return;
    }

    // YouTube / Vimeo
    const f = document.createElement('iframe');
    Object.assign(f, {
      src: playable.src,
      allow: 'fullscreen; picture-in-picture; encrypted-media',
      frameBorder: '0',
      referrerPolicy: 'no-referrer-when-downgrade'
    });
    f.style.width = '100%'; f.style.aspectRatio = '16/9'; f.style.display = 'block';
    container.appendChild(f);
  };

  /* ---------- HTML sanitizer for post content ---------- */
  const sanitizePostHTML = (html) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    // 1) Normalize WP caption wrappers to semantic figure/figcaption
    wrapper.querySelectorAll('.wp-caption').forEach(caption => {
      const fig = document.createElement('figure');
      // move children
      [...caption.childNodes].forEach(n => fig.appendChild(n));
      // move caption text
      const cap = fig.querySelector('.wp-caption-text');
      if (cap) { const fc = document.createElement('figcaption'); fc.innerHTML = cap.innerHTML; cap.replaceWith(fc); }
      caption.replaceWith(fig);
    });

    // 2) Unwrap anchors that only wrap a single IMG (keeps the image visible; link stays on the image)
    wrapper.querySelectorAll('a').forEach(a => {
      const onlyImg = a.children.length === 1 && a.firstElementChild?.tagName === 'IMG' && (a.textContent || '').trim() === '';
      if (onlyImg) { a.replaceWith(a.firstElementChild); }
    });

    // 3) Remove truly empty anchors (no visible content)
    wrapper.querySelectorAll('a').forEach(a => {
      const txt = (a.textContent || '').replace(/\s+/g,'');
      const hasImg = !!a.querySelector('img, picture, svg');
      const hasEmbed = !!a.querySelector('iframe, video');
      if (!txt && !hasImg && !hasEmbed) a.remove();
    });

    // 4) Ensure images are responsive
    wrapper.querySelectorAll('img').forEach(img => {
      img.removeAttribute('width'); img.removeAttribute('height');
      img.style.maxWidth = '100%'; img.style.height = 'auto'; img.style.display = 'block';
    });

    return wrapper.innerHTML;
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
    document.body.appendChild(sentinel);
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

      const cleaned = sanitizePostHTML(p.content?.rendered || '');

      app.innerHTML=`<article class="post-detail">
        ${hero}
        <h1 class="post-detail__title" style="color:#1E90FF;margin:0 0 8px;">${p.title?.rendered||''}</h1>
        <div class="byline" style="font-weight:600;margin:0 0 16px;">${byline(p)}</div>
        <div class="post-detail__content">${cleaned}</div>
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

  /* ---------- infinite scroll (resilient) ---------- */
  let io;
  let lastAppendTs = 0;
  const now = () => performance.now();

  const attachObserver = () => {
    if (io) io.disconnect();
    io = new IntersectionObserver(async entries => {
      const e = entries[0];
      if (!e.isIntersecting || loading || reachedEnd || route !== 'home') return;
      await loadNext();
    }, { root: null, rootMargin: '2000px 0px 1400px 0px', threshold: 0 });

    if (!document.body.contains(sentinel)) document.body.appendChild(sentinel);
    io.observe(sentinel);
  };

  const maybeKick = () => {
    if (route !== 'home' || loading || reachedEnd) return;
    const doc = document.documentElement;
    const nearBottom = doc.scrollHeight - (doc.scrollTop + window.innerHeight) < 800;
    if (nearBottom && (now() - lastAppendTs) > 1500) {
      loadNext();
    }
  };

  const loadNext = async ()=>{
    if (loading || reachedEnd || route!=='home') return;
    loading = true;
    try{
      const posts = await fetchPosts(page);
      if (!posts.length) { reachedEnd = true; return; }
      remember(page, posts);
      renderPage(posts);
      lastAppendTs = now();
      page += 1;
      if (document.documentElement.scrollHeight <= window.innerHeight + 200 && !reachedEnd) {
        (window.requestIdleCallback || setTimeout)(() => loadNext(), 50);
      }
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
      requestAnimationFrame(() => {
        const y = Number(sessionStorage.getItem(SS.SCROLL_Y)||'0');
        window.scrollTo({ top: y, behavior: 'auto' });
      });
      attachObserver();
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
        if (!restoreFeedIfAvailable()) {
          const feed=ensureFeed();
          page=1; reachedEnd=false; loading=false;
          feed.innerHTML='';
          attachObserver();
          await loadNext();
        } else {
          attachObserver();
          maybeKick();
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

  /* ---------- UI & fallbacks ---------- */
  hamburger?.addEventListener('click',()=>{
    if (menu.hasAttribute('hidden')) { menu.removeAttribute('hidden'); hamburger.setAttribute('aria-expanded','true'); }
    else { menu.setAttribute('hidden',''); hamburger.setAttribute('aria-expanded','false'); }
  });

  addEventListener('hashchange', router);
  let kickRAF = 0;
  addEventListener('scroll', () => {
    cancelAnimationFrame(kickRAF);
    kickRAF = requestAnimationFrame(maybeKick);
  }, { passive: true });

  addEventListener('beforeunload', snapshotFeed);

  (async ()=>{ await router(); if(route==='home') attachObserver(); })();
})();
 /* 🔴 main.js */
