// 🟢 main.js (OkObserver Build 2025-11-07SR1-videoFixR3-debugR1)
// Note: This build logs its version so we can confirm the *new* file is running.
/*
  - Infinite scroll (one fetch at a time) with duplicate guard
  - Bold byline on cards and detail
  - Robust video click-to-play (YouTube/Vimeo/Facebook/MP4) handling WP wrappers
  - Cartoon filter (category 5923 + term/title)
  - Session list + scroll restore
  - Grid MutationObserver enforcement
  - No ES modules
*/
(function(){
  const VER='2025-11-07SR1-videoFixR3-debugR1';
  console.log('[OkObserver] Main JS Build', VER);

  const API_BASE='https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
  const app=document.getElementById('app');

  let page=1, perPage=12, loading=false, done=false;
  const seenIds=new Set();

  const SCROLL='okobs-scroll', LIST='okobs-list', META='okobs-list-meta';

  const el=(t,c,h)=>{const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e;};
  const qs=(s,c)=> (c||document).querySelector(s);
  const qsa=(s,c)=> Array.from((c||document).querySelectorAll(s));
  const fetchJSON=u=>fetch(u,{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(r.status));
  const decodeEntities=s=>{ if(!s) return s; const d=document.createElement('textarea'); d.innerHTML=s; return d.value; };

  const isCartoon=p=>{
    try{
      if((p.categories||[]).includes(5923))return true;
      let terms=[];
      if(p._embedded&&p._embedded['wp:term'])
        p._embedded['wp:term'].forEach(a=>Array.isArray(a)&&(terms=terms.concat(a)));
      const has=terms.some(t=>{
        const slug=(t.slug||'').toLowerCase(); const name=(t.name||'').toLowerCase();
        return slug.includes('cartoon')||name.includes('cartoon');
      });
      if(has)return true;
      return (p.title?.rendered||'').toLowerCase().includes('cartoon');
    }catch{return false;}
  };

  function buildCard(p){
    const card=el('article','post-card');
    const link=el('a'); link.href='#/post/'+p.id;

    const media=p._embedded?.['wp:featuredmedia']?.[0]?.source_url;
    if(media){
      const img=el('img'); img.src=media+'?cb='+p.id; img.alt=p.title.rendered; img.loading='lazy';
      link.appendChild(img);
    }

    link.appendChild(el('h2','post-title', p.title.rendered));
    card.appendChild(link);

    const by=el('div','post-meta', `<strong>Oklahoma Observer</strong> — ${
      new Date(p.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})
    }`);
    card.appendChild(by);

    card.appendChild(el('div','post-excerpt', p.excerpt.rendered));
    return card;
  }

  function saveScroll(){ sessionStorage.setItem(SCROLL, String(window.scrollY||0)); }
  function restoreScroll(){ const y=sessionStorage.getItem(SCROLL); if(y!=null) window.scrollTo(0, parseFloat(y)); }

  function saveList(grid){
    try{
      sessionStorage.setItem(LIST, grid.innerHTML);
      sessionStorage.setItem(META, JSON.stringify({page,done,seen:[...seenIds]}));
    }catch{}
  }
  function restoreList(grid){
    const html=sessionStorage.getItem(LIST), meta=sessionStorage.getItem(META);
    if(!html||!meta) return false;
    grid.innerHTML=html;
    try{
      const m=JSON.parse(meta);
      page=m.page||1; done=!!m.done; (m.seen||[]).forEach(id=>seenIds.add(id));
    }catch{}
    return true;
  }

  function nearBottom(){ return document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) < 800; }

  function loadMore(grid){
    if(loading||done) return;
    loading=true;
    const url=`${API_BASE}posts?per_page=${perPage}&page=${page}&_embed`;
    fetchJSON(url).then(posts=>{
      if(!posts || !posts.length){ done=true; return; }
      posts.forEach(p=>{
        if(isCartoon(p)) return;
        if(seenIds.has(p.id)) return;
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
    document.title='The Oklahoma Observer';
    app.innerHTML='<div id="grid" class="okobs-grid"></div>';
    const grid=qs('#grid');

    if(restoreList(grid)){
      if(nearBottom()) loadMore(grid);
    }else{
      page=1; done=false; seenIds.clear();
      loadMore(grid);
    }

    const onScroll=()=>{ if(!done && !loading && nearBottom()) loadMore(grid); };
    window.addEventListener('scroll', onScroll, {passive:true});
  }

  function renderPost(id){
    fetchJSON(`${API_BASE}posts/${id}?_embed`).then(p=>{
      const hero=p._embedded?.['wp:featuredmedia']?.[0]?.source_url;
      const article=el('article','post-detail');

      if(hero){
        const fig=el('figure','post-hero');
        const img=el('img'); img.src=hero+'?cb='+p.id; img.alt=decodeEntities(p.title.rendered);
        fig.appendChild(img); article.appendChild(fig);
      }

      article.appendChild(el('h1','post-title', p.title.rendered));
      article.appendChild(el('div','post-meta', `<strong>Oklahoma Observer</strong> — ${
        new Date(p.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})
      }`));

      const body=el('div','post-body', p.content.rendered);
      article.appendChild(body);
      enhanceVideos(body);

      const back=el('button','back-btn','← Back to Posts');
      back.onclick=()=>{ location.hash='#/'; };
      article.appendChild(back);

      app.innerHTML=''; app.appendChild(article);
    });
  }

  function typeFromUrl(u){
    if(/youtube\.com|youtu\.be/i.test(u)) return 'youtube';
    if(/vimeo\.com/i.test(u)) return 'vimeo';
    if(/facebook\.com|fb\.watch/i.test(u)) return 'facebook';
    if(/\.(mp4|webm|ogg)(\?|#|$)/i.test(u)) return 'mp4';
    return '';
  }

  function fbPlugin(u){
    return 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(u) + '&autoplay=1&show_text=false&width=1280';
  }

  function enhanceVideos(scope){
    const nodes = qsa('iframe, video, figure.wp-block-embed, .wp-block-embed__wrapper, p > a[href]', scope);
    nodes.forEach(node=>{
      let src='', type='';
      if(node.tagName==='IFRAME' || node.tagName==='VIDEO'){ src=node.src||''; type=typeFromUrl(src); }
      else if(node.tagName==='A'){ src=node.href||''; type=typeFromUrl(src); }
      else{
        const a=node.querySelector('a[href]'); const i=node.querySelector('iframe');
        src = a ? a.href : (i ? i.src : '');
        type=typeFromUrl(src);
      }
      if(!src || !type) return;

      const wrap=document.createElement('div');
      wrap.className='okobs-video pending '+type;
      Object.assign(wrap.style,{position:'relative',cursor:'pointer',aspectRatio:'16/9',background:'#000',maxWidth:'100%',borderRadius:'12px',overflow:'hidden'});

      const poster=document.createElement('img');
      const hero=qs('.post-hero img');
      if(hero) poster.src=hero.currentSrc||hero.src;
      poster.alt='Play video';
      Object.assign(poster.style,{width:'100%',height:'100%',objectFit:'cover'});

      const btn=document.createElement('div');
      btn.className='play-overlay';
      btn.innerHTML='<div class="triangle"></div>';

      wrap.append(poster, btn);
      node.replaceWith(wrap);

      wrap.addEventListener('click', ()=>{
        if(type==='mp4'){
          const v=document.createElement('video');
          v.src=src; v.controls=true; v.autoplay=true;
          wrap.replaceChildren(v); wrap.classList.remove('pending'); return;
        }
        const ifr=document.createElement('iframe');
        ifr.allow='autoplay; encrypted-media; picture-in-picture';
        ifr.allowFullscreen=true; ifr.frameBorder='0';
        ifr.style.width='100%'; ifr.style.height='100%';
        if(type==='youtube') ifr.src=src.replace('watch?v=','embed/') + (src.includes('?')?'&':'?') + 'autoplay=1';
        else if(type==='vimeo') ifr.src=src.replace('vimeo.com','player.vimeo.com/video') + (src.includes('?')?'&':'?') + 'autoplay=1';
        else if(type==='facebook') ifr.src=fbPlugin(src);
        wrap.replaceChildren(ifr); wrap.classList.remove('pending');
      });
    });
  }

  function router(){
    const h=location.hash||'#/';
    if(h.startsWith('#/post/')){ saveScroll(); renderPost(h.split('/')[2]); }
    else { renderHome(); }
  }

  // Keep grid class enforced
  new MutationObserver(()=>{const g=qs('#grid'); if(g) g.classList.add('okobs-grid');})
    .observe(app,{childList:true,subtree:true});

  window.addEventListener('hashchange', router);
  router();
})();
// 🔴 main.js
