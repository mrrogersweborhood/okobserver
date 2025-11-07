// 🟢 main.js (OkObserver Build 2025-11-07SR1-videoFixR14-preDOMAutoEmbed+safe)
// FULL FILE REPLACEMENT — converts plain text/provider links in p.content.rendered into real iframes
// Safe rules: never rewrite if an <iframe>/<video> already exists; preserve infinite scroll, cartoon filter,
// bold byline, list+scroll restore, grid-enforcer, non-destructive gap cleanup.

(function(){
  const VER = '2025-11-07SR1-videoFixR14-preDOMAutoEmbed+safe';
  console.log('[OkObserver] Main JS Build', VER);

  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
  const app = document.getElementById('app');

  let page=1, perPage=12, loading=false, done=false;
  let seenIds=new Set();
  let _onHomeScroll=null;

  const SCROLL='okobs-scroll', LIST='okobs-list', META='okobs-list-meta';

  const el=(t,c,h)=>{const e=document.createElement(t); if(c) e.className=c; if(h!=null) e.innerHTML=h; return e;};
  const qs=(s,c)=> (c||document).querySelector(s);
  const fetchJSON=(u)=>fetch(u,{cache:'no-store'}).then(r=> r.ok ? r.json() : Promise.reject(r.status));
  const decodeEntities=(s)=>{ if(!s) return s; const d=document.createElement('textarea'); d.innerHTML=s; return d.value; };

  // Cartoon filter (category id + slug/name fallback)
  const isCartoon=(p)=>{
    try{
      if ((p.categories||[]).includes(5923)) return true;
      let terms=[];
      if (p._embedded && p._embedded['wp:term']) p._embedded['wp:term'].forEach(a=>Array.isArray(a)&&(terms=terms.concat(a)));
      if (terms.some(t=>String(t.slug||'').toLowerCase().includes('cartoon') || String(t.name||'').toLowerCase().includes('cartoon')))
        return true;
      return String(p.title?.rendered||'').toLowerCase().includes('cartoon');
    }catch(_){ return false; }
  };

  // Cards
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

  // List caching + scroll
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
  const nearBottom = ()=> (document.documentElement.scrollHeight - (window.scrollY + window.innerHeight)) < 800;

  function loadMore(grid){
    if (loading || done) return;
    loading = true;
    fetchJSON(`${API_BASE}posts?per_page=${perPage}&page=${page}&_embed`).then(posts=>{
      if (!posts || !posts.length){ done = true; return; }
      posts.forEach(p=>{
        if (isCartoon(p)) return;
        if (seenIds.has(p.id)) return;
        seenIds.add(p.id);
        grid.appendChild(buildCard(p));
      });
      page++;
      saveList(grid);
    }).catch(err=>console.warn('[OkObserver] loadMore failed', err))
      .finally(()=> loading=false);
  }

  function renderHome(){
    document.title = 'The Oklahoma Observer';
    app.innerHTML = '<div id="grid" class="okobs-grid"></div>';
    const grid = qs('#grid');

    page=1; done=false; seenIds=new Set();

    const restored = restoreList(grid);

    if (_onHomeScroll) window.removeEventListener('scroll', _onHomeScroll);
    _onHomeScroll = ()=>{ if (!done && !loading && nearBottom()) loadMore(grid); };
    window.addEventListener('scroll', _onHomeScroll, { passive:true });

    if (!restored) loadMore(grid);
    else if (nearBottom()) loadMore(grid);
  }

  // --- Gap cleanup (non-destructive)
  function nonDestructiveGapCleanup(body){
    if (!body) return;
    body.querySelectorAll('p').forEach(p=>{
      const txt = (p.textContent||'').replace(/\u00a0/g,' ').trim();
      const onlyBr = p.children.length===1 && p.firstElementChild.tagName==='BR';
      if (!txt && (p.children.length===0 || onlyBr)) p.remove();
    });
  }

  // Ensure embeds are visible/sized
  function ensureEmbedsVisible(body){
    if (!body) return;
    body.querySelectorAll('iframe, video, .fb-video, .fb-post, figure.wp-block-embed, .wp-block-embed__wrapper, div[data-oembed-url]')
      .forEach(node=>{
        if (node instanceof HTMLIFrameElement || node instanceof HTMLVideoElement){
          node.style.display='block';
          node.style.visibility='visible';
          node.style.maxWidth='100%';
          node.style.width='100%';
          const h = parseInt(getComputedStyle(node).height, 10);
          if (!h || h < 80){
            const w = node.getBoundingClientRect().width || node.parentElement?.clientWidth || 640;
            const calcH = Math.round(w * 9 / 16);
            node.style.minHeight = Math.max(calcH, 320) + 'px';
            node.style.height    = Math.max(calcH, 320) + 'px';
          }
        }else{
          node.style.display='block';
          node.style.visibility='visible';
          node.style.overflow='visible';
          node.style.maxWidth='100%';
          node.style.width='100%';
          node.style.minHeight='320px';
          node.style.margin='0 auto 16px';
        }
      });
  }

  // -------- PRE-DOM AUTO-EMBED (works on raw HTML string)
  // We process p.content.rendered STRING first, so plain text URLs or simple <a href> links get converted.
  const RX = {
    vimeo: /(https?:\/\/(?:www\.)?vimeo\.com\/(\d+)[^\s<>'"]*)/i,
    youtube: /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=([\w-]+)|youtu\.be\/([\w-]+))[^\s<>'"]*)/i,
    facebook: /(https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch)\/[^\s<>'"]+)/i
  };

  function alreadyHasPlayer(html){
    return /<iframe[\s\S]*?>|<video[\s\S]*?>|class="fb-video|class='fb-video/.test(html);
  }

  function makeIframeHTML(url){
    if (RX.vimeo.test(url)){
      const id = url.match(RX.vimeo)[2];
      const src = `https://player.vimeo.com/video/${id}`;
      return `<iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;min-height:360px;display:block;border:0"></iframe>`;
    }
    const ym = url.match(RX.youtube);
    if (ym){
      const vid = ym[2] || ym[3];
      const src = `https://www.youtube.com/embed/${vid}`;
      return `<iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;min-height:360px;display:block;border:0"></iframe>`;
    }
    if (RX.facebook.test(url)){
      const src = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&autoplay=0&show_text=false`;
      return `<iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;min-height:360px;display:block;border:0"></iframe>`;
    }
    return '';
  }

  function preDomAutoEmbed(html){
    // If there is already a player, do nothing.
    if (alreadyHasPlayer(html)) return html;

    // Look for provider URLs — either as plain text or inside <a href="...">
    // 1) Anchor case
    let m = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*<\/a>/i);
    if (m && (RX.vimeo.test(m[1])||RX.youtube.test(m[1])||RX.facebook.test(m[1]))){
      const iframe = makeIframeHTML(m[1]);
      if (iframe){
        // Insert the iframe right after the link’s enclosing <p> if possible
        html = html.replace(m[0], m[0] + iframe);
        return html;
      }
    }

    // 2) Plain text URL case (like your WP screenshot)
    const vm = html.match(RX.vimeo) || html.match(RX.youtube) || html.match(RX.facebook);
    if (vm){
      const url = vm[0];
      const iframe = makeIframeHTML(url);
      if (iframe){
        // Put iframe after the first paragraph that contains the URL, or at top if none
        // Replace the URL with a clickable link + iframe appended
        html = html.replace(url, `<a href="${url}" target="_blank" rel="noopener">${url}</a>${iframe}`);
      }
    }
    return html;
  }
  // -------- END PRE-DOM AUTO-EMBED

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
        `<strong>Oklahoma Observer</strong> — ` +
        `${new Date(p.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`
      ));

      // *** PROCESS THE RAW HTML BEFORE INSERTION ***
      let bodyHTML = String(p.content.rendered || '');
      bodyHTML = preDomAutoEmbed(bodyHTML);

      const body = el('div','post-body', bodyHTML);
      article.appendChild(body);

      nonDestructiveGapCleanup(body);
      ensureEmbedsVisible(body);

      const back = el('button','back-btn','← Back to Posts');
      back.onclick = ()=>{ location.hash = '#/'; };
      article.appendChild(back);

      app.innerHTML = '';
      app.appendChild(article);
    }).catch(err=>{
      console.warn('[OkObserver] renderPost failed', err);
    });
  }

  function router(){
    const h = location.hash || '#/';
    if (h.startsWith('#/post/')){ sessionStorage.setItem(SCROLL, String(window.scrollY||0)); renderPost(h.split('/')[2]); }
    else { renderHome(); }
  }

  // Grid enforcer
  new MutationObserver(()=>{ const g = qs('#grid'); if (g) g.classList.add('okobs-grid'); })
    .observe(app,{childList:true,subtree:true});

  window.addEventListener('hashchange', router);
  router();
})();
// 🔴 main.js (OkObserver Build 2025-11-07SR1-videoFixR14-preDOMAutoEmbed+safe)
