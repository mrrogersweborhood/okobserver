// 🟢 main.js (OkObserver Build 2025-11-07SR1-videoFixR8-noWrapLive-infiniteR1-gapFixR1)
// Full file replacement. Includes:
// - Infinite scroll hardening (single listener; guaranteed first/top-up loads)
// - Video enhancer: DOES NOT wrap existing live provider iframes (YouTube/Vimeo/Facebook)
// - Converts only links/WordPress wrappers/placeholders into click-to-play
// - Black-box cleanup for stray FB placeholders
// - Gap cleanup between hero image and first video
// - Cartoon filter, bold byline, session list+scroll cache, grid enforcer
// - No ES modules
// START MARKER: 🟢 main.js

(function(){
  const VER = '2025-11-07SR1-videoFixR8-noWrapLive-infiniteR1-gapFixR1';
  console.log('[OkObserver] Main JS Build', VER);

  // ---- constants / refs ----
  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
  const app = document.getElementById('app');

  // ---- list state ----
  let page = 1, perPage = 12, loading = false, done = false;
  let seenIds = new Set();

  // single scroll handler reference (prevents duplicates)
  let _onHomeScroll = null;

  // ---- cache keys ----
  const SCROLL = 'okobs-scroll';
  const LIST   = 'okobs-list';
  const META   = 'okobs-list-meta';

  // ---- tiny helpers ----
  const el  = (t,c,h)=>{ const e=document.createElement(t); if(c) e.className=c; if(h!=null) e.innerHTML=h; return e; };
  const qs  = (s,c)=> (c||document).querySelector(s);
  const qsa = (s,c)=> Array.from((c||document).querySelectorAll(s));
  const fetchJSON = (u)=> fetch(u,{cache:'no-store'}).then(r=> r.ok ? r.json() : Promise.reject(r.status));
  const decodeEntities = (s)=>{ if(!s) return s; const d=document.createElement('textarea'); d.innerHTML=s; return d.value; };

  // ---- business rules ----
  const isCartoon = (p)=>{
    try{
      if ((p.categories||[]).includes(5923)) return true;
      let terms=[];
      if (p._embedded && p._embedded['wp:term'])
        p._embedded['wp:term'].forEach(a=> Array.isArray(a) && (terms=terms.concat(a)));
      const has = terms.some(t=>{
        const slug=(t.slug||'').toLowerCase(); const name=(t.name||'').toLowerCase();
        return slug.includes('cartoon') || name.includes('cartoon');
      });
      if (has) return true;
      return (p.title?.rendered||'').toLowerCase().includes('cartoon');
    }catch(_){ return false; }
  };

  // ---- cards ----
  function buildCard(p){
    const card = el('article','post-card');
    const link = el('a'); link.href = '#/post/'+p.id;

    const media = p._embedded?.['wp:featuredmedia']?.[0]?.source_url;
    if (media){
      const img = el('img'); img.src = media+'?cb='+p.id; img.alt = p.title.rendered; img.loading='lazy';
      link.appendChild(img);
    }

    link.appendChild(el('h2','post-title', p.title.rendered));
    card.appendChild(link);

    const by = el('div','post-meta',
      `<strong>Oklahoma Observer</strong> — ${new Date(p.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`
    );
    card.appendChild(by);

    card.appendChild(el('div','post-excerpt', p.excerpt.rendered));
    return card;
  }

  // ---- caches ----
  function saveScroll(){ sessionStorage.setItem(SCROLL, String(window.scrollY||0)); }
  function restoreScroll(){ const y=sessionStorage.getItem(SCROLL); if(y!=null) window.scrollTo(0, parseFloat(y)); }

  function saveList(grid){
    try{
      sessionStorage.setItem(LIST, grid.innerHTML);
      sessionStorage.setItem(META, JSON.stringify({page,done,seen:[...seenIds]}));
    }catch(_){}
  }
  function restoreList(grid){
    const html = sessionStorage.getItem(LIST);
    const meta = sessionStorage.getItem(META);
    if (!html || !meta) return false;
    grid.innerHTML = html;
    try{
      const m = JSON.parse(meta);
      page = m.page||1; done = !!m.done; (m.seen||[]).forEach(id=>seenIds.add(id));
    }catch(_){}
    return true;
  }

  // ---- list fetching ----
  const nearBottom = ()=> (document.documentElement.scrollHeight - (window.scrollY + window.innerHeight)) < 800;

  function loadMore(grid){
    if (loading || done) return;
    loading = true;
    const url = `${API_BASE}posts?per_page=${perPage}&page=${page}&_embed`;
    fetchJSON(url).then(posts=>{
      if (!posts || !posts.length){ done = true; return; }
      posts.forEach(p=>{
        if (isCartoon(p)) return;
        if (seenIds.has(p.id)) return;
        seenIds.add(p.id);
        grid.appendChild(buildCard(p));
      });
      page++;
      saveList(grid);
    }).catch(err=>{
      console.warn('[OkObserver] loadMore failed', err);
    }).finally(()=> loading=false);
  }

  // ---- home ----
  function renderHome(){
    document.title = 'The Oklahoma Observer';
    app.innerHTML = '<div id="grid" class="okobs-grid"></div>';
    const grid = qs('#grid');

    // fresh state when entering Home
    page = 1; done = false; seenIds = new Set();

    const restored = restoreList(grid);

    // Ensure exactly ONE scroll listener
    if (_onHomeScroll) window.removeEventListener('scroll', _onHomeScroll);
    _onHomeScroll = ()=>{ if (!done && !loading && nearBottom()) loadMore(grid); };
    window.addEventListener('scroll', _onHomeScroll, { passive:true });

    // Always fetch at least once; top-up if page is short
    if (!restored) loadMore(grid);
    else if (nearBottom()) loadMore(grid);
  }

  // ---- detail ----
  function renderPost(id){
    fetchJSON(`${API_BASE}posts/${id}?_embed`).then(p=>{
      const hero = p._embedded?.['wp:featuredmedia']?.[0]?.source_url;
      const article = el('article','post-detail');

      if (hero){
        const fig = el('figure','post-hero');
        const img = el('img'); img.src = hero+'?cb='+p.id; img.alt = decodeEntities(p.title.rendered);
        fig.appendChild(img); article.appendChild(fig);
      }

      article.appendChild(el('h1','post-title', p.title.rendered));
      article.appendChild(el('div','post-meta',
        `<strong>Oklahoma Observer</strong> — ${new Date(p.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`
      ));

      const body = el('div','post-body', p.content.rendered);
      article.appendChild(body);
      enhanceVideos(body);

      const back = el('button','back-btn','← Back to Posts');
      back.onclick = ()=>{ location.hash = '#/'; };
      article.appendChild(back);

      app.innerHTML = '';
      app.appendChild(article);
    });
  }

  // ---- video enhancement ----
  const typeFromUrl = (u)=>{
    if (/youtube\.com|youtu\.be/i.test(u)) return 'youtube';
    if (/vimeo\.com/i.test(u)) return 'vimeo';
    if (/facebook\.com|fb\.watch/i.test(u)) return 'facebook';
    if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(u)) return 'mp4';
    return '';
  };
  const fbPlugin = (u)=> 'https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(u)+'&autoplay=1&show_text=false&width=1280';

  function firstFacebookUrlFrom(node){
    const dh = node.getAttribute?.('data-href');
    if (dh && /facebook\.com|fb\.watch/i.test(dh)) return dh.trim();
    const a = node.querySelector?.('a[href*="facebook.com"], a[href*="fb.watch"]'); if (a) return a.href;
    const ifr = node.querySelector?.('iframe[src*="facebook.com"], iframe[src*="fb.watch"]'); if (ifr) return ifr.src;
    const m = (node.textContent||'').match(/https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch)[^\s"')]+/i); if (m) return m[0];
    return '';
  }

  function enhanceVideos(scope){
    // wrap only wrappers/links/placeholders — leave REAL provider iframes alone
    const nodes = [
      ...qsa('figure.wp-block-embed, .wp-block-embed__wrapper, p > a[href]', scope),
      ...qsa('.fb-video, .fb-post, [data-href*="facebook.com"]', scope)
    ];
    const handled = new WeakSet();

    nodes.forEach(node=>{
      if (handled.has(node)) return;

      // If a proper provider iframe already exists here, do NOT replace it
      const existingIframe = node.tagName === 'IFRAME' ? node : node.querySelector?.('iframe');
      if (existingIframe) {
        const s = existingIframe.src || '';
        if (/youtube\.com|youtu\.be|vimeo\.com|facebook\.com|fb\.watch/i.test(s)) {
          // if it’s the first element, remove extra top gap
          if (node.parentElement && node === node.parentElement.firstElementChild) node.style.marginTop = '0';
          return;
        }
      }

      let src = '', type = '';
      const tag = node.tagName;

      if (tag === 'A'){
        src = node.href||''; type = typeFromUrl(src);
      } else {
        // for wrappers/placeholders, try to extract a video URL
        src = firstFacebookUrlFrom(node);
        if (!src){
          const a = node.querySelector?.('a[href], a');
          const i = node.querySelector?.('iframe');
          src = a ? (a.href||'') : (i ? (i.src||'') : '');
        }
        type = typeFromUrl(src);
      }

      if (!src || !type) return;

      // build click-to-play shell
      const wrap = document.createElement('div');
      wrap.className = 'okobs-video pending '+type;
      Object.assign(wrap.style,{
        position:'relative', cursor:'pointer', aspectRatio:'16/9', background:'#000',
        maxWidth:'100%', borderRadius:'12px', overflow:'hidden'
      });

      const poster = document.createElement('img');
      const hero = qs('.post-hero img');
      if (hero) poster.src = hero.currentSrc || hero.src;
      poster.alt='Play video';
      Object.assign(poster.style,{width:'100%',height:'100%',objectFit:'cover'});

      const btn = document.createElement('div');
      btn.className='play-overlay';
      btn.innerHTML = '<div class="triangle"></div>';

      wrap.append(poster, btn);
      node.replaceWith(wrap);
      handled.add(wrap);

      wrap.addEventListener('click', ()=>{
        if (type === 'mp4'){
          const v = document.createElement('video');
          v.src = src; v.controls = true; v.autoplay = true;
          wrap.replaceChildren(v); wrap.classList.remove('pending'); return;
        }
        const ifr = document.createElement('iframe');
        ifr.allow = 'autoplay; encrypted-media; picture-in-picture';
        ifr.allowFullscreen = true; ifr.frameBorder='0';
        ifr.style.width='100%'; ifr.style.height='100%';
        if (type==='youtube')  ifr.src = src.replace('watch?v=','embed/') + (src.includes('?')?'&':'?') + 'autoplay=1';
        else if (type==='vimeo') ifr.src = src.replace('vimeo.com','player.vimeo.com/video') + (src.includes('?')?'&':'?') + 'autoplay=1';
        else if (type==='facebook') ifr.src = fbPlugin(src);
        wrap.replaceChildren(ifr); wrap.classList.remove('pending');
      });
    });

    // remove blank placeholders (black boxes / white gaps)
    document.querySelectorAll('.fb-video, figure.wp-block-embed, .wp-block-embed__wrapper').forEach(el=>{
      const ifr = el.querySelector('iframe');
      const hasPlayer = ifr && (ifr.src||'').includes('facebook.com');
      if (!hasPlayer && el.offsetHeight < 80) el.remove();
    });

    // 🧹 Collapse white-space blocks between hero and first video
    (function cleanGaps(){
      const body = scope; if (!body) return;

      // Remove empty paragraphs and non-breaking-space spacers
      body.querySelectorAll('p').forEach(p=>{
        const txt = (p.textContent||'').replace(/\u00a0/g,' ').trim();
        const onlyBr = p.children.length===1 && p.firstElementChild.tagName==='BR';
        if (!txt && (p.children.length===0 || onlyBr)) p.remove();
      });

      // If first real node is a video/embed, cut top margin
      const first = Array.from(body.children).find(n=> n.nodeType===1);
      if (first && (
          first.classList.contains('okobs-video') ||
          first.matches('figure.wp-block-embed, .wp-block-embed__wrapper, iframe, video')
        )){
        first.style.marginTop = '0';
      }
    })();
  }

  // ---- router ----
  function router(){
    const h = location.hash || '#/';
    if (h.startsWith('#/post/')){ saveScroll(); renderPost(h.split('/')[2]); }
    else { renderHome(); }
  }

  // ---- grid enforcement ----
  new MutationObserver(()=>{ const g = qs('#grid'); if (g) g.classList.add('okobs-grid'); })
    .observe(app,{childList:true,subtree:true});

  window.addEventListener('hashchange', router);
  router();
})();

// END MARKER: 🔴 main.js
// 🔴 main.js (OkObserver Build 2025-11-07SR1-videoFixR8-noWrapLive-infiniteR1-gapFixR1)
