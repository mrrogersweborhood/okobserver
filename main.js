// 🟢 main.js (OkObserver Build 2025-11-07SR1-videoFixR13-autoEmbedTextSafe)
// FULL FILE REPLACEMENT
// Adds detection for plain-text Vimeo/YouTube/Facebook URLs in post body and auto-embeds them safely
// Keeps infinite scroll, cartoon filter, bold byline, scroll restore, gap cleanup, grid enforcer
(function(){
  const VER = '2025-11-07SR1-videoFixR13-autoEmbedTextSafe';
  console.log('[OkObserver] Main JS Build', VER);

  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
  const app = document.getElementById('app');

  let page=1, perPage=12, loading=false, done=false;
  let seenIds=new Set();
  let _onHomeScroll=null;
  const SCROLL='okobs-scroll', LIST='okobs-list', META='okobs-list-meta';

  const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
  const qs=(s,c)=> (c||document).querySelector(s);
  const fetchJSON=(u)=>fetch(u,{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(r.status));
  const decodeEntities=(s)=>{if(!s)return s;const d=document.createElement('textarea');d.innerHTML=s;return d.value;};

  const isCartoon=(p)=>{
    try{
      if((p.categories||[]).includes(5923))return true;
      let terms=[];if(p._embedded&&p._embedded['wp:term'])p._embedded['wp:term'].forEach(a=>Array.isArray(a)&&(terms=terms.concat(a)));
      if(terms.some(t=>(t.slug||'').includes('cartoon')||(t.name||'').includes('Cartoon')))return true;
      return(p.title?.rendered||'').toLowerCase().includes('cartoon');
    }catch(_){return false;}
  };

  function buildCard(p){
    const card=el('article','post-card');
    const link=el('a');link.href='#/post/'+p.id;
    const media=p._embedded?.['wp:featuredmedia']?.[0]?.source_url;
    if(media){const img=el('img');img.src=media+'?cb='+p.id;img.alt=p.title.rendered;img.loading='lazy';link.appendChild(img);}
    link.appendChild(el('h2','post-title',p.title.rendered));
    card.appendChild(link);
    const by=el('div','post-meta',`<strong>Oklahoma Observer</strong> — ${new Date(p.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`);
    card.appendChild(by);
    card.appendChild(el('div','post-excerpt',p.excerpt.rendered));
    return card;
  }

  const nearBottom=()=> (document.documentElement.scrollHeight-(window.scrollY+window.innerHeight))<800;
  function loadMore(grid){
    if(loading||done)return;
    loading=true;
    fetchJSON(`${API_BASE}posts?per_page=${perPage}&page=${page}&_embed`).then(posts=>{
      if(!posts||!posts.length){done=true;return;}
      posts.forEach(p=>{
        if(isCartoon(p))return;
        if(seenIds.has(p.id))return;
        seenIds.add(p.id);
        grid.appendChild(buildCard(p));
      });
      page++;
      sessionStorage.setItem(LIST,grid.innerHTML);
      sessionStorage.setItem(META,JSON.stringify({page,done,seen:[...seenIds]}));
    }).catch(e=>console.warn('[OkObserver] loadMore failed',e)).finally(()=>loading=false);
  }

  function renderHome(){
    document.title='The Oklahoma Observer';
    app.innerHTML='<div id="grid" class="okobs-grid"></div>';
    const grid=qs('#grid');
    page=1;done=false;seenIds=new Set();
    if(_onHomeScroll)window.removeEventListener('scroll',_onHomeScroll);
    _onHomeScroll=()=>{if(!done&&!loading&&nearBottom())loadMore(grid);};
    window.addEventListener('scroll',_onHomeScroll,{passive:true});
    loadMore(grid);
  }

  function nonDestructiveGapCleanup(body){
    if(!body)return;
    body.querySelectorAll('p').forEach(p=>{
      const txt=(p.textContent||'').replace(/\u00a0/g,' ').trim();
      if(!txt&&p.children.length===0)p.remove();
    });
  }

  function ensureEmbedsVisible(body){
    if(!body)return;
    body.querySelectorAll('iframe,video,.fb-video,.fb-post,figure.wp-block-embed').forEach(node=>{
      node.style.display='block';
      node.style.visibility='visible';
      node.style.width='100%';
      node.style.maxWidth='100%';
      node.style.minHeight='360px';
    });
  }

  const rx={
    vimeo:/(https?:\/\/(?:www\.)?vimeo\.com\/\d+)/i,
    youtube:/(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+)/i,
    facebook:/(https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch)\/[^\s<>'"]+)/i
  };

  function findAnyProviderUrl(body){
    // 1) anchors
    const a=body.querySelector('a[href*="vimeo.com"],a[href*="youtube.com"],a[href*="youtu.be"],a[href*="facebook.com"],a[href*="fb.watch"]');
    if(a)return a.href;
    // 2) plain text
    const txt=body.textContent||'';
    const m=txt.match(rx.vimeo)||txt.match(rx.youtube)||txt.match(rx.facebook);
    return m?m[1]:'';
  }

  function makeIframe(url){
    let src='';
    if(rx.vimeo.test(url))src=url.replace('vimeo.com/','player.vimeo.com/video/');
    else if(rx.youtube.test(url))src=url.includes('watch?v=')?url.replace('watch?v=','embed/'):url.replace('youtu.be/','www.youtube.com/embed/');
    else if(rx.facebook.test(url))src='https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(url)+'&autoplay=0&show_text=false';
    if(!src)return null;
    const ifr=document.createElement('iframe');
    ifr.src=src;ifr.allow='autoplay;encrypted-media;picture-in-picture';ifr.allowFullscreen=true;
    ifr.style.width='100%';ifr.style.minHeight='360px';ifr.style.display='block';
    return ifr;
  }

  function maybeAutoEmbed(body){
    const already=body.querySelector('iframe,video,.fb-video,.fb-post');
    if(already)return;
    const url=findAnyProviderUrl(body);
    if(!url)return;
    const ifr=makeIframe(url);
    if(!ifr)return;
    const firstP=body.querySelector('p')||body.firstElementChild;
    if(firstP)firstP.insertAdjacentElement('afterend',ifr);
  }

  function renderPost(id){
    fetchJSON(`${API_BASE}posts/${id}?_embed`).then(p=>{
      const hero=p._embedded?.['wp:featuredmedia']?.[0]?.source_url;
      const article=el('article','post-detail');
      if(hero){const fig=el('figure','post-hero');const img=el('img');img.src=hero+'?cb='+p.id;img.alt=p.title.rendered;fig.appendChild(img);article.appendChild(fig);}
      article.appendChild(el('h1','post-title',p.title.rendered));
      article.appendChild(el('div','post-meta',`<strong>Oklahoma Observer</strong> — ${new Date(p.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`));
      const body=el('div','post-body',p.content.rendered);
      article.appendChild(body);
      nonDestructiveGapCleanup(body);
      ensureEmbedsVisible(body);
      maybeAutoEmbed(body);
      ensureEmbedsVisible(body);
      const back=el('button','back-btn','← Back to Posts');back.onclick=()=>location.hash='#/';
      article.appendChild(back);
      app.innerHTML='';app.appendChild(article);
    });
  }

  function router(){
    const h=location.hash||'#/';
    if(h.startsWith('#/post/'))renderPost(h.split('/')[2]);else renderHome();
  }

  new MutationObserver(()=>{const g=qs('#grid');if(g)g.classList.add('okobs-grid');}).observe(app,{childList:true,subtree:true});
  window.addEventListener('hashchange',router);
  router();
})();
// 🔴 main.js (OkObserver Build 2025-11-07SR1-videoFixR13-autoEmbedTextSafe)
