// 🟢 main.js (OkObserver Build 2025-11-07SR1-videoFixR16-preDOM+postDOM-embedGuarantee)
// FULL FILE REPLACEMENT. Guarantees a visible player by:
// 1) preDomAutoEmbed() — converts provider URLs to iframes in the HTML string BEFORE insert
// 2) postDomEnsureEmbed() — after insert, if no player is present, finds a provider URL in DOM and injects an iframe
(function(){
  const VER = '2025-11-07SR1-videoFixR16-preDOM+postDOM-embedGuarantee';
  console.log('[OkObserver] Main JS Build', VER);

  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
  const app = document.getElementById('app');

  let page=1, perPage=12, loading=false, done=false;
  let seenIds=new Set();
  let _onHomeScroll=null;

  const KEYS={SCROLL:'okobs-scroll', LIST:'okobs-list', META:'okobs-list-meta'};

  const el=(t,c,h)=>{const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e;};
  const qs=(s,c)=> (c||document).querySelector(s);
  const fetchJSON=(u)=>fetch(u,{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(r.status));

  // Cartoon filter
  const isCartoon=(p)=>{
    try{
      if((p.categories||[]).includes(5923)) return true;
      let terms=[]; if(p._embedded&&p._embedded['wp:term']) p._embedded['wp:term'].forEach(a=>Array.isArray(a)&&(terms=terms.concat(a)));
      if(terms.some(t=>String(t.slug||'').toLowerCase().includes('cartoon')||String(t.name||'').toLowerCase().includes('cartoon'))) return true;
      return String(p.title?.rendered||'').toLowerCase().includes('cartoon');
    }catch(_){return false;}
  };

  // Home cards
  function buildCard(p){
    const card=el('article','post-card');
    const link=el('a'); link.href='#/post/'+p.id;

    const media=p._embedded?.['wp:featuredmedia']?.[0]?.source_url;
    if(media){ const img=el('img'); img.src=media+'?cb='+p.id; img.alt=p.title.rendered; img.loading='lazy'; link.appendChild(img); }

    link.appendChild(el('h2','post-title',p.title.rendered));
    card.appendChild(link);

    const by=el('div','post-meta',
      `<strong>Oklahoma Observer</strong> — ${new Date(p.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`
    );
    card.appendChild(by);

    card.appendChild(el('div','post-excerpt',p.excerpt.rendered));
    return card;
  }

  function saveList(grid){
    try{
      sessionStorage.setItem(KEYS.LIST, grid.innerHTML);
      sessionStorage.setItem(KEYS.META, JSON.stringify({page,done,seen:[...seenIds]}));
    }catch(_){}
  }
  function restoreList(grid){
    const html=sessionStorage.getItem(KEYS.LIST);
    const meta=sessionStorage.getItem(KEYS.META);
    if(!html||!meta) return false;
    grid.innerHTML=html;
    try{
      const m=JSON.parse(meta); page=m.page||1; done=!!m.done; (m.seen||[]).forEach(id=>seenIds.add(id));
    }catch(_){}
    return true;
  }
  const nearBottom=()=> (document.documentElement.scrollHeight-(window.scrollY+window.innerHeight))<800;

  function loadMore(grid){
    if(loading||done) return;
    loading=true;
    fetchJSON(`${API_BASE}posts?per_page=${perPage}&page=${page}&_embed`).then(posts=>{
      if(!posts||!posts.length){ done=true; return; }
      posts.forEach(p=>{
        if(isCartoon(p)) return;
        if(seenIds.has(p.id)) return;
        seenIds.add(p.id);
        grid.appendChild(buildCard(p));
      });
      page++;
      saveList(grid);
    }).catch(e=>console.warn('[OkObserver] loadMore failed',e)).finally(()=>loading=false);
  }

  function renderHome(){
    document.title='The Oklahoma Observer';
    app.innerHTML='<div id="grid" class="okobs-grid"></div>';
    const grid=qs('#grid');
    page=1; done=false; seenIds=new Set();
    const restored=restoreList(grid);
    if(_onHomeScroll) window.removeEventListener('scroll',_onHomeScroll);
    _onHomeScroll=()=>{ if(!done&&!loading&&nearBottom()) loadMore(grid); };
    window.addEventListener('scroll',_onHomeScroll,{passive:true});
    if(!restored) loadMore(grid); else if(nearBottom()) loadMore(grid);
  }

  // Hygiene
  function nonDestructiveGapCleanup(root){
    if(!root) return;
    root.querySelectorAll('p').forEach(p=>{
      const txt=(p.textContent||'').replace(/\u00a0/g,' ').trim();
      const onlyBr = p.children.length===1 && p.firstElementChild.tagName==='BR';
      if(!txt && (p.children.length===0 || onlyBr)) p.remove();
    });
  }
  function ensureEmbedsVisible(root){
    if(!root) return;
    root.querySelectorAll('iframe,video,.fb-video,.fb-post,figure.wp-block-embed,.wp-block-embed__wrapper,div[data-oembed-url]')
      .forEach(node=>{
        if(node instanceof HTMLIFrameElement || node instanceof HTMLVideoElement){
          Object.assign(node.style,{display:'block',visibility:'visible',width:'100%',maxWidth:'100%',border:'0'});
          const w=(node.getBoundingClientRect().width||node.parentElement?.clientWidth||640);
          const minH=Math.max(Math.round(w*9/16),320);
          const cur=parseInt(getComputedStyle(node).height,10)||0;
          if(cur<120){ node.style.minHeight=minH+'px'; node.style.height=minH+'px'; } else { node.style.minHeight='320px'; }
        }else{
          Object.assign(node.style,{display:'block',visibility:'visible',width:'100%',maxWidth:'100%',minHeight:'320px',margin:'0 auto 16px'});
        }
      });
  }

  // Provider detection
  const RX={
    vimeo: /(https?:\/\/(?:www\.)?vimeo\.com\/(\d+))(?:[^\s<>'"]*)/i,
    youtube: /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=([\w-]+)|youtu\.be\/([\w-]+)))(?:[^\s<>'"]*)/i,
    facebook: /(https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch)\/[^\s<>'"]+)/i
  };
  const hasPlayerHTML=(html)=> /<iframe[\s\S]*?>|<video[\s\S]*?>|class=(["'])fb-(?:video|post)\1/i.test(html);
  const normalize=(s)=> String(s||'').replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&');

  function makeIframeFromURL(url){
    // Vimeo
    const vm=url.match(RX.vimeo);
    if(vm){ const id=vm[2]; return `<iframe src="https://player.vimeo.com/video/${id}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;min-height:360px;display:block;border:0"></iframe>`; }
    // YouTube
    const ym=url.match(RX.youtube);
    if(ym){ const id=ym[2]||ym[3]; return `<iframe src="https://www.youtube.com/embed/${id}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;min-height:360px;display:block;border:0"></iframe>`; }
    // Facebook
    if(RX.facebook.test(url)){ const src=`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&autoplay=0&show_text=false`; return `<iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;min-height:360px;display:block;border:0"></iframe>`; }
    return '';
  }

  // Pre-DOM conversion
  function preDomAutoEmbed(html){
    let working = normalize(html);
    if(hasPlayerHTML(working)) return working;

    // Try anchor href first
    const aMatch = working.match(/<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/i);
    if(aMatch){
      const url=aMatch[1];
      const iframe=makeIframeFromURL(url);
      if(iframe){ return working.replace(aMatch[0], aMatch[0] + iframe); }
    }
    // Plain text URL anywhere
    const pm = working.match(RX.vimeo)||working.match(RX.youtube)||working.match(RX.facebook);
    if(pm){
      const url=pm[0];
      const iframe=makeIframeFromURL(url);
      if(iframe){ working = working.replace(url, `<a href="${url}" target="_blank" rel="noopener">${url}</a>${iframe}`); }
    }
    return working;
  }

  // Post-DOM fallback — if no player rendered, inject one under first paragraph
  function postDomEnsureEmbed(root){
    if(!root) return;
    if(root.querySelector('iframe, video, .fb-video, .fb-post')) return; // already present

    // Try to find URL in anchors
    let url='';
    const a = root.querySelector('a[href]');
    if(a) url = normalize(a.getAttribute('href')||'');

    // Else scan text/HTML
    if(!url){
      const html = normalize(root.innerHTML||'');
      const text = root.textContent||'';
      const pick = (s)=> (s.match(RX.vimeo)||s.match(RX.youtube)||s.match(RX.facebook))?.[0] || '';
      url = pick(html) || pick(text);
    }
    if(!url) return;

    const iframeHTML = makeIframeFromURL(url);
    if(!iframeHTML) return;

    const firstP = root.querySelector('p');
    const wrap = document.createElement('div');
    wrap.innerHTML = iframeHTML;
    const iframe = wrap.firstElementChild;
    (firstP || root).insertAdjacentElement('afterend', iframe);

    ensureEmbedsVisible(root);
    console.log('[OkObserver] postDomEnsureEmbed injected player from', url);
  }

  // Detail
  function renderPost(id){
    fetchJSON(`${API_BASE}posts/${id}?_embed`).then(p=>{
      const hero=p._embedded?.['wp:featuredmedia']?.[0]?.source_url;

      const article=el('article','post-detail');
      if(hero){ const fig=el('figure','post-hero'); const img=el('img'); img.src=hero+'?cb='+p.id; img.alt=p.title.rendered; fig.appendChild(img); article.appendChild(fig); }

      article.appendChild(el('h1','post-title',p.title.rendered));
      article.appendChild(el('div','post-meta',
        `<strong>Oklahoma Observer</strong> — ${new Date(p.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`
      ));

      // Convert BEFORE insert
      let bodyHTML = preDomAutoEmbed(p.content.rendered||'');
      const body=el('div','post-body', bodyHTML);
      article.appendChild(body);

      nonDestructiveGapCleanup(body);
      ensureEmbedsVisible(body);

      // Fallback AFTER insert if still no player
      postDomEnsureEmbed(body);

      const back=el('button','back-btn','← Back to Posts');
      back.onclick=()=>{ location.hash='#/'; };
      article.appendChild(back);

      app.innerHTML=''; app.appendChild(article);
    }).catch(err=>console.warn('[OkObserver] renderPost failed',err));
  }

  function router(){
    const h=location.hash||'#/';
    if(h.startsWith('#/post/')){
      sessionStorage.setItem(KEYS.SCROLL, String(window.scrollY||0));
      renderPost(h.split('/')[2]);
    }else{
      renderHome();
    }
  }

  new MutationObserver(()=>{ const g=qs('#grid'); if(g) g.classList.add('okobs-grid'); })
    .observe(app,{childList:true,subtree:true});

  window.addEventListener('hashchange',router);
  router();
})();
// 🔴 main.js (OkObserver Build 2025-11-07SR1-videoFixR16-preDOM+postDOM-embedGuarantee)
