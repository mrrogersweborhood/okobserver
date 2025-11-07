<!-- 🟢 main.js (OkObserver Build 2025-11-07SR1-videoFixR18-entityDecodeForceEmbed) -->
<script>
/*
  OkObserver main.js — FULL FILE
  Build: 2025-11-07SR1-videoFixR18-entityDecodeForceEmbed
  Purpose:
    - Restore stable home grid (4/3/1), return-to-scroll, 1 fetch per page
    - Preserve cartoon filter, bylines, click-to-detail
    - On post detail: DECODE HTML ENTITIES, detect provider links (Vimeo/YT/Facebook)
      from anchors OR raw text (even with "&amp;"), and inject a proper <iframe>
      if none rendered. Also ensure visibility/height so players don’t collapse.
  NOTE: 🟢/🔴 markers required by user are included here and at end.
*/

(function(){
  const VER = '2025-11-07SR1-videoFixR18-entityDecodeForceEmbed';
  console.log('[OkObserver] Main JS Build', VER);

  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
  const app = document.getElementById('app');

  // ---------- small helpers ----------
  const el=(t,c,h)=>{const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e;};
  const qs=(s,c)=> (c||document).querySelector(s);
  const qsa=(s,c)=> Array.from((c||document).querySelectorAll(s));
  const fetchJSON=(u)=>fetch(u,{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(r.status));
  const decodeHTML=(s)=>{
    // Robust entity decoding for &amp;, &quot;, &#...; etc
    const ta = document.createElement('textarea'); ta.innerHTML = s || '';
    // Some WP content double-encodes ampersands; decode twice defensively.
    const once = ta.value; ta.innerHTML = once; return ta.value;
  };
  const stripTags=(s)=> decodeHTML(String(s||'').replace(/<\/?[^>]+>/g,' '));

  // ---------- state ----------
  let page=1, perPage=12, loading=false, done=false;
  let seenIds=new Set();
  const KEYS={SCROLL:'okobs-scroll', LIST:'okobs-list', META:'okobs-list-meta'};

  // ---------- filters ----------
  const isCartoon=(p)=>{
    try{
      if((p.categories||[]).includes(5923)) return true;
      let terms=[]; if(p._embedded&&p._embedded['wp:term']) p._embedded['wp:term'].forEach(a=>Array.isArray(a)&&(terms=terms.concat(a)));
      if(terms.some(t=>String(t.slug||'').toLowerCase().includes('cartoon')||String(t.name||'').toLowerCase().includes('cartoon'))) return true;
      return String(p.title?.rendered||'').toLowerCase().includes('cartoon');
    }catch(_){return false;}
  };

  // ---------- home ----------
  function buildCard(p){
    const card=el('article','post-card');
    const link=el('a'); link.href='#/post/'+p.id;

    const media=p._embedded?.['wp:featuredmedia']?.[0]?.source_url;
    if(media){ const img=el('img'); img.src=media+'?cb='+p.id; img.alt=stripTags(p.title.rendered); img.loading='lazy'; link.appendChild(img); }

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
      page++; saveList(grid);
    }).catch(e=>console.warn('[OkObserver] loadMore failed',e)).finally(()=>loading=false);
  }

  function renderHome(){
    document.title='The Oklahoma Observer';
    app.innerHTML='<div id="grid" class="okobs-grid"></div>';
    const grid=qs('#grid');
    page=1; done=false; seenIds=new Set();
    const restored=restoreList(grid);
    const onScroll=()=>{ if(!done&&!loading&&nearBottom()) loadMore(grid); };
    window.removeEventListener('scroll', onScroll); // noop detach
    window.addEventListener('scroll', onScroll, {passive:true});
    if(!restored) loadMore(grid); else if(nearBottom()) loadMore(grid);
  }

  // ---------- post detail helpers ----------
  const RX={
    vimeo: /https?:\/\/(?:www\.)?vimeo\.com\/(\d+)(?:[^\s<>'"]*)/i,
    youtube: /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^"'<>]*v=([\w-]+)|youtu\.be\/([\w-]+))(?:[^\s<>'"]*)/i,
    facebook: /https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch)\/[^\s<>'"]+/i
  };

  function makeIframeFromURL(url){
    if(!url) return null;
    let src='';
    const vm = url.match(RX.vimeo);
    if(vm) src=`https://player.vimeo.com/video/${vm[1]}`;
    const yt = url.match(RX.youtube);
    if(!src && yt) src=`https://www.youtube.com/embed/${yt[1]||yt[2]}`;
    if(!src && RX.facebook.test(url)){
      src=`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&autoplay=0&show_text=false`;
    }
    if(!src) return null;
    const ifr=document.createElement('iframe');
    ifr.src=src; ifr.allow='autoplay; encrypted-media; picture-in-picture'; ifr.allowFullscreen=true;
    Object.assign(ifr.style,{display:'block',visibility:'visible',width:'100%',maxWidth:'100%',minHeight:'480px',border:'0',margin:'0 auto 16px'});
    return ifr;
  }

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
    qsa('iframe,video,.fb-video,.fb-post,figure.wp-block-embed,.wp-block-embed__wrapper,div[data-oembed-url]', root)
      .forEach(node=>{
        if(node instanceof HTMLIFrameElement || node instanceof HTMLVideoElement){
          Object.assign(node.style,{display:'block',visibility:'visible',width:'100%',maxWidth:'100%',border:'0'});
          const w=(node.getBoundingClientRect().width||node.parentElement?.clientWidth||640);
          const minH=Math.max(Math.round(w*9/16),360);
          const cur=parseInt(getComputedStyle(node).height,10)||0;
          if(cur<120){ node.style.minHeight=minH+'px'; node.style.height=minH+'px'; }
        }else{
          Object.assign(node.style,{display:'block',visibility:'visible',width:'100%',maxWidth:'100%',minHeight:'360px',margin:'0 auto 16px'});
        }
      });
  }

  function extractProviderURLFromDOM(root){
    // 1) anchors first
    for(const a of qsa('a[href]', root)){
      let href=a.getAttribute('href')||'';
      href=decodeHTML(href);
      if(RX.vimeo.test(href)||RX.youtube.test(href)||RX.facebook.test(href)) return href;
    }
    // 2) full HTML/text, decoded
    const html=decodeHTML(root.innerHTML||'');
    const text=decodeHTML(root.textContent||'');
    const find=(s)=> (s.match(/https?:\/\/[^\s<>'"]+/g)||[]).find(u=>RX.vimeo.test(u)||RX.youtube.test(u)||RX.facebook.test(u)) || '';
    return find(html) || find(text) || '';
  }

  // ---------- post detail ----------
  function renderPost(id){
    fetchJSON(`${API_BASE}posts/${id}?_embed`).then(p=>{
      const hero=p._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
      const titleHTML=p.title?.rendered||'';
      const contentHTML=p.content?.rendered||'';

      const article=el('article','post-detail');
      if(hero){ const fig=el('figure','post-hero'); const img=el('img'); img.src=hero+'?cb='+p.id; img.alt=stripTags(titleHTML); fig.appendChild(img); article.appendChild(fig); }

      article.appendChild(el('h1','post-title',titleHTML));
      article.appendChild(el('div','post-meta',
        `<strong>Oklahoma Observer</strong> — ${new Date(p.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`
      ));

      // Insert decoded content
      const decoded = decodeHTML(contentHTML);
      const body=el('div','post-body', decoded);
      article.appendChild(body);

      // Clean & make visible
      nonDestructiveGapCleanup(body);
      ensureEmbedsVisible(body);

      // If no iframe/video present, force-detect & inject one from any provider URL.
      if(!body.querySelector('iframe,video,.fb-video,.fb-post')){
        const url = extractProviderURLFromDOM(article); // search across the entire article (title/body)
        if(url){
          const ifr = makeIframeFromURL(url);
          if(ifr){
            const firstP = body.querySelector('p') || body;
            firstP.insertAdjacentElement('afterend', ifr);
            console.log('[OkObserver] injected player from', url);
          }else{
            console.warn('[OkObserver] provider URL found, but could not build iframe:', url);
          }
        }else{
          console.warn('[OkObserver] no provider URL found in decoded DOM');
        }
      }

      // Safety: re-assert visibility/size after any injection
      ensureEmbedsVisible(body);

      const back=el('button','back-btn','← Back to Posts');
      back.onclick=()=>{ location.hash='#/'; };
      article.appendChild(back);

      app.innerHTML=''; app.appendChild(article);
    }).catch(err=>console.warn('[OkObserver] renderPost failed',err));
  }

  // ---------- router ----------
  function router(){
    const h=location.hash||'#/';
    if(h.startsWith('#/post/')) renderPost(h.split('/')[2]);
    else renderHome();
  }

  // ---------- grid enforcer (never remove) ----------
  new MutationObserver(()=>{ const g=qs('#grid'); if(g) g.classList.add('okobs-grid'); })
    .observe(app,{childList:true,subtree:true});

  window.addEventListener('hashchange',router);
  router();
})();
</script>
<!-- 🔴 main.js (OkObserver Build 2025-11-07SR1-videoFixR18-entityDecodeForceEmbed) -->
