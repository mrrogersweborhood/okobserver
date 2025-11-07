// 🟢 main.js (OkObserver Build 2025-11-07SR1-videoFixR12-autoEmbedSafe-infiniteR1-gapFixR3)
// FULL FILE REPLACEMENT
// - Never touches existing provider iframes/videos
// - If no visible player is present, auto-embeds when it finds a Vimeo/YouTube/Facebook URL in post body
// - Infinite scroll hardened; cartoon filter; bold byline; list+scroll restore; grid enforcer
// - Non-destructive gap cleanup; ensure embeds visible
// START MARKER: 🟢 main.js
(function(){
  const VER = '2025-11-07SR1-videoFixR12-autoEmbedSafe-infiniteR1-gapFixR3';
  console.log('[OkObserver] Main JS Build', VER);

  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
  const app = document.getElementById('app');

  let page = 1, perPage = 12, loading = false, done = false;
  let seenIds = new Set();
  let _onHomeScroll = null;

  const SCROLL = 'okobs-scroll';
  const LIST   = 'okobs-list';
  const META   = 'okobs-list-meta';

  const el  = (t,c,h)=>{ const e=document.createElement(t); if(c) e.className=c; if(h!=null) e.innerHTML=h; return e; };
  const qs  = (s,c)=> (c||document).querySelector(s);
  const qsa = (s,c)=> Array.from((c||document).querySelectorAll(s));
  const fetchJSON = (u)=> fetch(u,{cache:'no-store'}).then(r=> r.ok ? r.json() : Promise.reject(r.status));
  const decodeEntities = (s)=>{ if(!s) return s; const d=document.createElement('textarea'); d.innerHTML=s; return d.value; };

  // cartoons
  const isCartoon = (p)=>{
    try{
      if ((p.categories||[]).includes(5923)) return true;
      let terms=[];
      if (p._embedded && p._embedded['wp:term']) p._embedded['wp:term'].forEach(a=>Array.isArray(a)&&(terms=terms.concat(a)));
      const has = terms.some(t=> (t.slug||'').toLowerCase().includes('cartoon') || (t.name||'').toLowerCase().includes('cartoon'));
      if (has) return true;
      return (p.title?.rendered||'').toLowerCase().includes('cartoon');
    }catch(_){ return false; }
  };

  // card
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

  // list cache
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

  // fetching
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

  function renderHome(){
    document.title = 'The Oklahoma Observer';
    app.innerHTML = '<div id="grid" class="okobs-grid"></div>';
    const grid = qs('#grid');

    page = 1; done = false; seenIds = new Set();

    const restored = restoreList(grid);

    if (_onHomeScroll) window.removeEventListener('scroll', _onHomeScroll);
    _onHomeScroll = ()=>{ if (!done && !loading && nearBottom()) loadMore(grid); };
    window.addEventListener('scroll', _onHomeScroll, { passive:true });

    if (!restored) loadMore(grid);
    else if (nearBottom()) loadMore(grid);
  }

  // gap cleanup
  function nonDestructiveGapCleanup(body){
    if (!body) return;
    body.querySelectorAll('p').forEach(p=>{
      const txt = (p.textContent||'').replace(/\u00a0/g,' ').trim();
      const onlyBr = p.children.length===1 && p.firstElementChild.tagName==='BR';
      if (!txt && (p.children.length===0 || onlyBr)) p.remove();
    });
    const first = Array.from(body.children).find(n=> n.nodeType===1);
    if (first && first.matches?.('figure.wp-block-embed, .wp-block-embed__wrapper, iframe, video'))
      first.style.marginTop = '0';
  }

  // visibility & sizing
  function ensureEmbedsVisible(body){
    if (!body) return;
    const embeds = body.querySelectorAll('iframe, video, .fb-video, .fb-post, figure.wp-block-embed, .wp-block-embed__wrapper, div[data-oembed-url]');
    embeds.forEach(node=>{
      if (node instanceof HTMLIFrameElement || node instanceof HTMLVideoElement){
        node.style.display = 'block';
        node.style.visibility = 'visible';
        node.style.maxWidth = '100%';
        node.style.width = '100%';
        const h = parseInt(getComputedStyle(node).height, 10);
        if (!h || h < 80){
          const w = node.getBoundingClientRect().width || node.parentElement?.clientWidth || 640;
          const calcH = Math.round(w * 9 / 16);
          node.style.minHeight = Math.max(calcH, 320) + 'px';
          node.style.height = Math.max(calcH, 320) + 'px';
        }
      }else{
        node.style.display = 'block';
        node.style.visibility = 'visible';
        node.style.overflow = 'visible';
        node.style.maxWidth = '100%';
        node.style.width = '100%';
        node.style.minHeight = '320px';
        node.style.margin = '0 auto 16px';
      }
    });
  }

  // URL detectors
  const rx = {
    vimeo: /(https?:\/\/(?:www\.)?vimeo\.com\/\d+(?:[^\s<>'"]*)?)/i,
    youtube: /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+)(?:[^\s<>'"]*)?)/i,
    facebook: /(https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch)\/[^\s<>'"]*)/i
  };

  function findFirstProviderUrl(root){
    // href on <a>
    const a = root.querySelector('a[href*="vimeo.com"], a[href*="youtube.com"], a[href*="youtu.be"], a[href*="facebook.com"], a[href*="fb.watch"]');
    if (a) return a.href;
    // any text URL in body
    const txt = root.textContent || '';
    const m = txt.match(rx.vimeo) || txt.match(rx.youtube) || txt.match(rx.facebook);
    return m ? m[1] : '';
  }

  function makeIframeFor(url){
    let src = '', type='';
    if (rx.vimeo.test(url)){ type='vimeo'; src = url.replace('vimeo.com/','player.vimeo.com/video/'); }
    else if (rx.youtube.test(url)){
      type='youtube';
      src = url.includes('watch?v=') ? url.replace('watch?v=','embed/') : url.replace('youtu.be/','www.youtube.com/embed/');
    }else if (rx.facebook.test(url)){ type='facebook'; src = 'https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(url)+'&autoplay=0&show_text=false&width=1280'; }
    if (!type) return null;

    const ifr = document.createElement('iframe');
    ifr.allow = 'autoplay; encrypted-media; picture-in-picture';
    ifr.allowFullscreen = true; ifr.frameBorder='0';
    ifr.style.width = '100%'; ifr.style.minHeight = '360px'; ifr.style.display='block';
    ifr.src = src;
    return ifr;
  }

  function maybeAutoEmbed(body){
    // if a player already exists, do nothing
    const already = body.querySelector('iframe, video, .fb-video, .fb-post');
    if (already) { return false; }

    const url = findFirstProviderUrl(body);
    if (!url) return false;

    const ifr = makeIframeFor(url);
    if (!ifr) return false;

    // Insert after any intro paragraph, otherwise at top
    const target = body.querySelector('p') || body.firstElementChild || body;
    target.parentNode.insertBefore(ifr, target.nextSibling);
    return true;
  }

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

      nonDestructiveGapCleanup(body);
      ensureEmbedsVisible(body);

      const auto = maybeAutoEmbed(body);
      if (auto) {
        console.log('[OkObserver] Auto-embedded provider video from body URL');
        ensureEmbedsVisible(body);
      }

      const back = el('button','back-btn','← Back to Posts');
      back.onclick = ()=>{ location.hash = '#/'; };
      article.appendChild(back);

      app.innerHTML = '';
      app.appendChild(article);
    });
  }

  function router(){
    const h = location.hash || '#/';
    if (h.startsWith('#/post/')){ saveScroll(); renderPost(h.split('/')[2]); }
    else { renderHome(); }
  }

  new MutationObserver(()=>{ const g = qs('#grid'); if (g) g.classList.add('okobs-grid'); })
    .observe(app,{childList:true,subtree:true});

  window.addEventListener('hashchange', router);
  router();
})();
// END MARKER: 🔴 main.js
// 🔴 main.js (OkObserver Build 2025-11-07SR1-videoFixR12-autoEmbedSafe-infiniteR1-gapFixR3)
