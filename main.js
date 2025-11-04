/* 🟢 main.js — 2025-11-03 R1aj
   Deterministic return-to-place:
   - Saves feed HTML, page, reachedEnd, scrollY, activeId, cssPath on every card click and before route change
   - Sets a one-shot "RETURN_TOKEN" when navigating into detail
   - On coming back to home, a pre-router restore runs FIRST:
       * paints cached feed
       * seek-until-found active card (loadNext until present, with cap)
       * scrolls to saved Y and focuses the active card
       * only then allows normal router/fetch to continue
   - Prevents feed leak into detail; tightened cartoon filter; robust video detection
   - FB videos: featured image + “View on Facebook”; tags bottom; bold byline; blue titles; no autoplay
*/
(function () {
  'use strict';
  window.AppVersion = '2025-11-03R1aj';
  console.log('[OkObserver] main.js', window.AppVersion);

  const API_BASE  = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PAGE_SIZE = 12;
  const MAX_CARDS = 60;

  let page = 1, loading = false, reachedEnd = false, route = 'home';
  const app       = document.getElementById('app');
  const sentinel  = document.getElementById('sentinel');
  const menu      = document.getElementById('menu');
  const hamburger = document.getElementById('hamburger');

  const SS = {
    FEED_HTML:   'okob.feed.html',
    FEED_PAGE:   'okob.feed.page',
    FEED_END:    'okob.feed.end',
    SCROLL_Y:    'okob.feed.scrollY',
    ACTIVE_ID:   'okob.feed.activeCardId',
    ACTIVE_PATH: 'okob.feed.activeCssPath',
    RETURN_TOKEN:'okob.feed.returnToken'
  };

  const getState = () => (history.state && typeof history.state === 'object') ? history.state : {};
  const setState = (patch) => { try { history.replaceState({ ...(getState()||{}), ...patch }, ''); } catch {} };
  const pushState = (patch) => { try { history.pushState({ ...(getState()||{}), ...patch }, ''); } catch {} };

  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});} catch { return ''; } };
  const byline  = p => `${p._embedded?.author?.[0]?.name || 'Staff'} · ${fmtDate(p.date)}`;

  // Tight cartoon filter
  const isCartoon = post => {
    const groups = post?._embedded?.['wp:term'] || [];
    const terms  = groups.flat().filter(Boolean);
    return terms.some(t => {
      if (!t || !t.taxonomy) return false;
      const slug = (t.slug || '').toLowerCase();
      const name = (t.name || '').toLowerCase();
      return slug === 'cartoon' || name === 'cartoon';
    });
  };

  // Featured image helpers
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

  // Video detection
  const decodeEntities = (s='') => { try { const el=document.createElement('textarea'); el.innerHTML=s; return el.value; } catch { return s; } };
  const findUrls = (raw='') => { const txt=decodeEntities(raw); const out=[]; const re=/https?:\/\/[^\s"'<>)]+/gi; let m; while((m=re.exec(txt))) out.push(m[0]); return out; };
  const extractVideo = html => {
    const urls = findUrls(html);
    const vimeo = urls.find(u => /\/\/(?:www\.)?vimeo\.com\/(\d+)/i.test(u));
    if (vimeo) { const id=(vimeo.match(/vimeo\.com\/(\d+)/i)||[])[1]; if (id) return { type:'vimeo', src:`https://player.vimeo.com/video/${id}` }; }
    const ytu = urls.find(u => /youtube\.com\/watch\?v=|youtu\.be\//i.test(u));
    if (ytu) { const id=(ytu.match(/v=([A-Za-z0-9_-]{11})/)||[])[1]||(ytu.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)||[])[1]; if (id) return { type:'youtube', src:`https://www.youtube.com/embed/${id}?rel=0` }; }
    const fbu = urls.find(u => /facebook\.com\/(?:watch\/?\?v=|.*\/videos\/\d+)/i.test(u));
    if (fbu) return { type:'facebook', src:'', orig:fbu };
    const vid = html.match(/<video[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (vid) return { type:'video', src:vid[1] };
    return null;
  };

  // Inline playable
  const playInlineVideo = (container, playable, post) => {
    if (!playable || !container) return;
    container.innerHTML = '';
    if (playable.type === 'facebook') {
      container.innerHTML = imgHTML(post) || '';
      const btn = document.createElement('div');
      btn.style.marginTop = '8px';
      btn.innerHTML = `<a class="button" target="_blank" rel="noopener" href="${playable.orig || '#'}">View on Facebook</a>`;
      container.appendChild(btn); return;
    }
    if (playable.type === 'video') {
      const v=document.createElement('video');
      Object.assign(v,{src:playable.src,controls:true,playsInline:true});
      v.style.width='100%'; v.style.aspectRatio='16/9'; v.style.display='block';
      container.appendChild(v); return;
    }
    const f=document.createElement('iframe');
    Object.assign(f,{src:playable.src,allow:'fullscreen; picture-in-picture; encrypted-media',frameBorder:'0',referrerPolicy:'no-referrer-when-downgrade'});
    f.style.width='100%'; f.style.aspectRatio='16/9'; f.style.display='block';
    container.appendChild(f);
  };

  // Sanitize post HTML
  const sanitizePostHTML = (html) => {
    const wrap=document.createElement('div'); wrap.innerHTML=html;
    wrap.querySelectorAll('.wp-caption').forEach(c=>{
      const fig=document.createElement('figure'); [...c.childNodes].forEach(n=>fig.appendChild(n));
      const cap=fig.querySelector('.wp-caption-text'); if (cap){const fc=document.createElement('figcaption'); fc.innerHTML=cap.innerHTML; cap.replaceWith(fc);}
      c.replaceWith(fig);
    });
    wrap.querySelectorAll('a').forEach(a=>{
      const onlyImg=a.children.length===1 && a.firstElementChild?.tagName==='IMG' && (a.textContent||'').trim()==='';
      if (onlyImg) a.replaceWith(a.firstElementChild);
    });
    wrap.querySelectorAll('a').forEach(a=>{
      const txt=(a.textContent||'').replace(/\s+/g,''); const hasImg=!!a.querySelector('img,picture,svg'); const hasEmb=!!a.querySelector('iframe,video');
      if (!txt && !hasImg && !hasEmb) a.remove();
    });
    wrap.querySelectorAll('img').forEach(img=>{
      img.removeAttribute('width'); img.removeAttribute('height'); img.style.maxWidth='100%'; img.style.height='auto'; img.style.display='block';
    });
    return wrap.innerHTML;
  };

  // Feed helpers
  const ensureFeed=()=>{ let feed=document.querySelector('.posts-grid'); if(!feed){feed=document.createElement('div'); feed.className='posts-grid'; app.innerHTML=''; app.appendChild(feed);} return feed; };
  const trimCards=()=>{ const c=document.querySelector('.posts-grid'); if(!c)return; while(c.children.length>MAX_CARDS)c.removeChild(c.firstElementChild); };
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
    if (route !== 'home') return;
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

  const tagsHTML = p => {
    const groups = p?._embedded?.['wp:term'] || [];
    const terms = groups.flat().filter(t => t && (t.taxonomy==='post_tag'||t.taxonomy==='category'));
    if (!terms.length) return '';
    const seen=new Set(), chips=[];
    for(const t of terms){
      if(seen.has(t.id)) continue; seen.add(t.id);
      const name=(t.name||'').trim(); if(!name) continue;
      if (name.toLowerCase()==='cartoon') continue;
      chips.push(`<span class="tag-chip" title="${t.taxonomy}">${name}</span>`);
    }
    return chips.length ? `<div class="post-tags">${chips.join('')}</div>` : '';
  };

  const renderAbout = ()=>{ app.innerHTML=`<section><h1>About The Oklahoma Observer</h1><p>Independent journalism since 1969. Tips: <a href="mailto:okobserver@outlook.com">okobserver@outlook.com</a></p></section>`; };

  const notFound = (id, status='Not found')=>{
    app.innerHTML = `<article class="post-detail" style="max-width:880px;margin:0 auto;padding:0 12px;">
      <h1 class="post-detail__title" style="color:#1E90FF;margin:0 0 8px;">Post not found</h1>
      <div class="byline" style="font-weight:600;margin:0 0 16px;">ID ${id} • ${status}</div>
      <p>We couldn’t load this article. It may have been removed or is restricted.</p>
      <p style="margin-top:24px;"><a class="button" href="#/">Back to Posts</a></p>
    </article>`;
  };

  // Utilities for snapshots
  const cssPath = (el) => {
    if (!el || !el.nodeType) return '';
    const path = [];
    for (let node = el; node && node.nodeType === 1 && node !== document; node = node.parentElement) {
      let sel = node.nodeName.toLowerCase();
      if (node.id) { sel += `#${CSS.escape(node.id)}`; path.unshift(sel); break; }
      let sib=node, idx=1; while ((sib=sib.previousElementSibling) != null) { if (sib.nodeName === node.nodeName) idx++; }
      sel += `:nth-of-type(${idx})`;
      path.unshift(sel);
    }
    return path.join(' > ');
  };

  const snapshotFeed = () => {
    try {
      if (route !== 'home') return;
      const feed = document.querySelector('.posts-grid'); if (!feed) return;
      const y = window.scrollY || 0;
      sessionStorage.setItem(SS.FEED_HTML, feed.innerHTML);
      sessionStorage.setItem(SS.FEED_PAGE, String(page));
      sessionStorage.setItem(SS.FEED_END,  String(reachedEnd));
      sessionStorage.setItem(SS.SCROLL_Y,  String(y));
      setState({ y, route:'home' });
    } catch {}
  };

  const restoreFocusToActiveCard = () => {
    try {
      const id = sessionStorage.getItem(SS.ACTIVE_ID);
      const path = sessionStorage.getItem(SS.ACTIVE_PATH);
      let link = id ? document.querySelector(`.post-card[data-id="${id}"] a.title-link`) : null;
      if (!link && path) {
        const el = document.querySelector(path);
        link = el?.querySelector?.('a.title-link') || null;
      }
      if (link) link.focus({ preventScroll:true });
    } catch {}
  };

  // Load data
  const fetchPosts = async n=>{
    const r=await fetch(`${API_BASE}/posts?per_page=${PAGE_SIZE}&page=${n}&_embed=1&orderby=date&order=desc&status=publish`);
    if(!r.ok){ if(r.status===400||r.status===404) reachedEnd=true; throw new Error(r.status); }
    const posts=await r.json(); return posts.filter(p=>!isCartoon(p));
  };

  // Infinite scroll
  let io; let lastAppendTs=0; const now=()=>performance.now();
  const attachObserver = () => {
    if (io) io.disconnect();
    io = new IntersectionObserver(async entries => {
      const e = entries[0];
      if (!e.isIntersecting || loading || reachedEnd || route !== 'home') return;
      await loadNext();
    }, { root:null, rootMargin:'2000px 0px 1400px 0px', threshold:0 });
    if (!document.body.contains(sentinel)) document.body.appendChild(sentinel);
    io.observe(sentinel);
  };
  const maybeKick = () => {
    if (route!=='home'||loading||reachedEnd) return;
    const doc=document.documentElement;
    const nearBottom = doc.scrollHeight - (doc.scrollTop + window.innerHeight) < 800;
    if (nearBottom && (now()-lastAppendTs)>1500) loadNext();
  };
  const loadNext = async ()=>{
    if (loading||reachedEnd||route!=='home') return;
    loading=true;
    try{
      const posts=await fetchPosts(page);
      if(!posts.length){ reachedEnd=true; return; }
      renderPage(posts); lastAppendTs=now(); page+=1;
      if (document.documentElement.scrollHeight <= window.innerHeight + 200 && !reachedEnd) {
        (window.requestIdleCallback || setTimeout)(() => loadNext(), 50);
      }
      snapshotFeed();
    } finally { loading=false; }
  };

  // Navigation snapshots + RETURN token
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.title-link');
    if (!a) return;
    if (route === 'home') {
      try {
        const card = e.target.closest('.post-card');
        const y = window.scrollY || 0;
        const id = card?.dataset?.id || null;
        const path = (card && cssPath(card)) || '';
        const feed = document.querySelector('.posts-grid');
        sessionStorage.setItem(SS.SCROLL_Y, String(y));
        if (id) sessionStorage.setItem(SS.ACTIVE_ID, String(id));
        if (path) sessionStorage.setItem(SS.ACTIVE_PATH, String(path));
        if (feed) {
          sessionStorage.setItem(SS.FEED_HTML, feed.innerHTML);
          sessionStorage.setItem(SS.FEED_PAGE, String(page));
          sessionStorage.setItem(SS.FEED_END,  String(reachedEnd));
        }
        // Mark that the next visit to home should restore BEFORE router runs
        sessionStorage.setItem(SS.RETURN_TOKEN, '1');
        pushState({ y, route:'home', activeId:id, activePath:path });
      } catch {}
    }
  }, { capture:true });

  // PRE-ROUTER RESTORE: runs before first router pass if we’re returning
  const preRouterRestoreIfReturning = async () => {
    const token = sessionStorage.getItem(SS.RETURN_TOKEN);
    if (!token) return false; // normal flow
    // consume token
    sessionStorage.removeItem(SS.RETURN_TOKEN);

    route = 'home';
    // 1) paint cached DOM
    const html = sessionStorage.getItem(SS.FEED_HTML);
    if (!html) return false;
    const savedPage = Number(sessionStorage.getItem(SS.FEED_PAGE)||'1');
    const savedEnd  = sessionStorage.getItem(SS.FEED_END)==='true';
    const yStored   = Number(sessionStorage.getItem(SS.SCROLL_Y)||'0');
    const yState    = (getState().y ?? yStored) | 0;
    const activeId  = sessionStorage.getItem(SS.ACTIVE_ID) || null;

    const feed = ensureFeed();
    feed.innerHTML = html;
    page = Math.max(1, savedPage);
    reachedEnd = !!savedEnd;

    // 2) ensure the active card exists (seek)
    const seekUntilFound = async (activeId, maxExtraPages = 8) => {
      if (!activeId) return;
      let tries = 0;
      while (!document.querySelector(`.post-card[data-id="${activeId}"]`) && !reachedEnd && tries < maxExtraPages) {
        await loadNext();
        tries++;
      }
    };
    await seekUntilFound(activeId);

    // 3) scroll + focus
    window.scrollTo({ top: yState, behavior: 'auto' });
    restoreFocusToActiveCard();

    // 4) attach IO and allow normal router to continue later
    attachObserver();
    if (document.documentElement.scrollHeight <= window.innerHeight + 200 && !reachedEnd) {
      (window.requestIdleCallback || setTimeout)(() => loadNext(), 50);
    }
    return true;
  };

  // Router
  const router = async ()=>{
    const parts=(location.hash||'#/').slice(2).split('/');
    switch(parts[0]){
      case '':
      case 'posts': {
        route='home';
        // If pre-router restore already handled it, do nothing
        const alreadyRestored = false;
        if (!alreadyRestored) {
          // Normal home render (if user arrived fresh or no snapshot)
          const feed=ensureFeed();
          if (!sessionStorage.getItem(SS.FEED_HTML)) {
            page=1; reachedEnd=false; loading=false;
            feed.innerHTML=''; attachObserver(); await loadNext();
          } else {
            // If snapshot still exists but no token, try gentle restore (no seek)
            const html=sessionStorage.getItem(SS.FEED_HTML);
            if (html) {
              feed.innerHTML=html;
              page=Number(sessionStorage.getItem(SS.FEED_PAGE)||'1');
              reachedEnd=sessionStorage.getItem(SS.FEED_END)==='true';
              requestAnimationFrame(()=>{
                const y=Number(sessionStorage.getItem(SS.SCROLL_Y)||'0');
                window.scrollTo({ top:y, behavior:'auto' });
              });
              attachObserver(); maybeKick();
            } else {
              page=1; reachedEnd=false; loading=false;
              feed.innerHTML=''; attachObserver(); await loadNext();
            }
          }
        }
        break;
      }
      case 'about':
        route='about'; if (io) io.disconnect(); app.innerHTML=''; renderAbout(); break;
      case 'settings':
        route='settings'; if (io) io.disconnect();
        app.innerHTML = `<section><h1>Settings</h1><p>Build <strong>${window.AppVersion}</strong></p></section>`;
        break;
      case 'post':
        route='detail';
        if (io) io.disconnect();
        const oldGrid=document.querySelector('.posts-grid'); if (oldGrid) oldGrid.remove();
        // keep snapshot intact for return
        // render
        await renderDetail(parts[1]);
        break;
      default:
        route='home'; ensureFeed(); attachObserver(); break;
    }
  };

  // Back/Forward + lifecycle
  addEventListener('pageshow', async () => {
    // If returning to posts/home, try pre-router restore FIRST
    if (location.hash === '' || location.hash === '#/' || location.hash.startsWith('#/posts')) {
      if (await preRouterRestoreIfReturning()) return;
      // else normal flow
      await router();
    }
  });

  addEventListener('popstate', async () => {
    if (location.hash === '' || location.hash === '#/' || location.hash.startsWith('#/posts')) {
      if (await preRouterRestoreIfReturning()) return;
      await router();
    }
  });

  // UI & misc
  hamburger?.addEventListener('click',()=>{
    if (menu.hasAttribute('hidden')) { menu.removeAttribute('hidden'); hamburger.setAttribute('aria-expanded','true'); }
    else { menu.setAttribute('hidden',''); hamburger.setAttribute('aria-expanded','false'); }
  });

  addEventListener('hashchange', router);
  addEventListener('scroll', () => { requestAnimationFrame(() => { if(route==='home') sessionStorage.setItem(SS.SCROLL_Y, String(window.scrollY||0)); }); }, { passive:true });
  addEventListener('beforeunload', snapshotFeed);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') snapshotFeed(); });

  // Initial boot: prefer pre-router restore; if not returning, run router
  (async ()=>{ if (!(await preRouterRestoreIfReturning())) await router(); })();
})();
 /* 🔴 main.js */
