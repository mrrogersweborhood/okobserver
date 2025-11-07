// 🟢 main.js (OkObserver Build 2025-11-07SR1-perfSWR1-videoFixR3)
/*
  Maintains:
  - Sticky header, centered logo+motto
  - Grid 4/3/1 responsive
  - Infinite scroll
  - Cartoon filter
  - Cached post list + scroll restore
  - Enhanced click-to-play videos (YouTube, Vimeo, Facebook, MP4)
  - MutationObserver grid enforcer
  - No ES modules
*/
(function(){
  const API_BASE='https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
  const app=document.getElementById('app');
  let page=1, perPage=12, loading=false, done=false;
  const seenIds=new Set();
  const scrollKey='okobs-scroll', listKey='okobs-list', metaKey='okobs-list-meta';
  const VER='2025-11-07SR1-perfSWR1-videoFixR3';
  console.log('[OkObserver] Build',VER);

  const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
  const qs=(s,c)=> (c||document).querySelector(s);
  const qsa=(s,c)=>Array.from((c||document).querySelectorAll(s));
  const fetchJSON=u=>fetch(u).then(r=>r.ok?r.json():Promise.reject(r.status));

  const decodeEntities=s=>{
    if(!s)return s;
    const d=document.createElement('textarea');
    d.innerHTML=s;
    return d.value;
  };

  const isCartoon=p=>{
    try{
      if((p.categories||[]).includes(5923))return true;
      let terms=[];
      if(p._embedded&&p._embedded['wp:term'])
        p._embedded['wp:term'].forEach(a=>Array.isArray(a)&&(terms=terms.concat(a)));
      const has=terms.some(t=>{
        const slug=(t.slug||'').toLowerCase(), name=(t.name||'').toLowerCase();
        return slug.includes('cartoon')||name.includes('cartoon');
      });
      if(has)return true;
      return (p.title?.rendered||'').toLowerCase().includes('cartoon');
    }catch{return false;}
  };

  function buildCard(p){
    const card=el('article','post-card');
    const link=el('a');link.href='#/post/'+p.id;
    const media=p._embedded?.['wp:featuredmedia']?.[0]?.source_url;
    if(media){
      const img=el('img');
      img.src=media+'?cb='+p.id;img.alt=p.title.rendered;img.loading='lazy';
      link.appendChild(img);
    }
    link.appendChild(el('h2','post-title',p.title.rendered));
    card.appendChild(link);
    const by=el('div','post-meta',`<strong>Oklahoma Observer</strong> — ${new Date(p.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`);
    card.appendChild(by);
    card.appendChild(el('div','post-excerpt',p.excerpt.rendered));
    return card;
  }

  const restoreScroll=()=>{const y=sessionStorage.getItem(scrollKey);if(y)window.scrollTo(0,parseFloat(y));};
  const saveScroll=()=>sessionStorage.setItem(scrollKey,window.scrollY||0);

  function loadPage(grid){
    if(loading||done)return;
    loading=true;
    const url=`${API_BASE}posts?per_page=${perPage}&page=${page}&_embed`;
    fetchJSON(url).then(posts=>{
      if(!posts.length){done=true;return;}
      posts.forEach(p=>{
        if(isCartoon(p))return;
        if(seenIds.has(p.id))return;
        seenIds.add(p.id);
        grid.appendChild(buildCard(p));
      });
      page++;
      sessionStorage.setItem(listKey,grid.innerHTML);
      sessionStorage.setItem(metaKey,JSON.stringify({page,done,seen:[...seenIds]}));
    }).catch(e=>console.warn('[OkObserver] loadPage error',e)).finally(()=>loading=false);
  }

  function restoreList(grid){
    const html=sessionStorage.getItem(listKey);
    const meta=sessionStorage.getItem(metaKey);
    if(!html||!meta)return false;
    grid.innerHTML=html;
    try{
      const m=JSON.parse(meta);
      page=m.page;done=m.done;for(const id of m.seen)seenIds.add(id);
    }catch{}
    return true;
  }

  function renderHome(){
    app.innerHTML='<div id="grid" class="okobs-grid"></div>';
    const grid=qs('#grid');
    if(restoreList(grid))return;
    page=1;done=false;seenIds.clear();
    loadPage(grid);
    window.addEventListener('scroll',()=>{
      if(done||loading)return;
      if(document.documentElement.scrollHeight-window.scrollY-window.innerHeight<800)
        loadPage(grid);
    },{passive:true});
  }

  function renderPost(id){
    fetchJSON(`${API_BASE}posts/${id}?_embed`).then(p=>{
      const hero=p._embedded?.['wp:featuredmedia']?.[0]?.source_url;
      const article=el('article','post-detail');
      if(hero){
        const fig=el('figure','post-hero');
        const img=el('img');img.src=hero+'?cb='+p.id;img.alt=p.title.rendered;
        fig.appendChild(img);article.appendChild(fig);
      }
      article.appendChild(el('h1','post-title',p.title.rendered));
      article.appendChild(el('div','post-meta',`<strong>Oklahoma Observer</strong> — ${new Date(p.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`));
      const body=el('div','post-body',p.content.rendered);
      article.appendChild(body);
      enhanceVideos(body);
      const back=el('button','back-btn','← Back to Posts');
      back.onclick=()=>{location.hash='#/';};
      article.appendChild(back);
      app.innerHTML='';app.appendChild(article);
    });
  }

  function enhanceVideos(scope){
    const nodes=qsa('iframe,video,figure.wp-block-embed,.wp-block-embed__wrapper,p>a[href]',scope);
    nodes.forEach(n=>{
      let src='',type='';
      if(n.tagName==='IFRAME'||n.tagName==='VIDEO'){src=n.src;type=typeFromUrl(src);}
      else if(n.tagName==='A'){src=n.href;type=typeFromUrl(src);}
      else{
        const a=n.querySelector('a[href]'),i=n.querySelector('iframe');
        src=a?a.href:(i?i.src:'');type=typeFromUrl(src);
      }
      if(!src||!type)return;
      const wrap=el('div','okobs-video pending '+type);
      Object.assign(wrap.style,{position:'relative',cursor:'pointer',aspectRatio:'16/9',background:'#000',maxWidth:'100%',borderRadius:'12px',overflow:'hidden'});
      const poster=el('img');const hero=qs('.post-hero img');
      poster.src=hero?(hero.currentSrc||hero.src):'';poster.alt='Play video';
      Object.assign(poster.style,{width:'100%',height:'100%',objectFit:'cover'});
      const overlay=el('div','play-overlay','<div class="triangle"></div>');
      wrap.append(poster,overlay);
      n.replaceWith(wrap);
      wrap.onclick=()=>{
        if(type==='mp4'){
          const v=document.createElement('video');
          v.src=src;v.controls=true;v.autoplay=true;
          wrap.replaceChildren(v);wrap.classList.remove('pending');return;
        }
        const i=document.createElement('iframe');
        i.allow='autoplay; encrypted-media; picture-in-picture';i.allowFullscreen=true;
        i.frameBorder='0';i.style.width='100%';i.style.height='100%';
        if(type==='youtube')i.src=src.replace('watch?v=','embed/')+(src.includes('?')?'&':'?')+'autoplay=1';
        else if(type==='vimeo')i.src=src.replace('vimeo.com','player.vimeo.com/video')+(src.includes('?')?'&':'?')+'autoplay=1';
        else if(type==='facebook')i.src='https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(src)+'&autoplay=1&show_text=false&width=1280';
        wrap.replaceChildren(i);wrap.classList.remove('pending');
      };
    });
  }

  const typeFromUrl=u=>{
    if(/youtube\.com|youtu\.be/i.test(u))return'youtube';
    if(/vimeo\.com/i.test(u))return'vimeo';
    if(/facebook\.com|fb\.watch/i.test(u))return'facebook';
    if(/\.(mp4|webm|ogg)(\?|#|$)/i.test(u))return'mp4';
    return'';
  };

  function router(){
    const h=location.hash||'#/';
    if(h.startsWith('#/post/')){saveScroll();renderPost(h.split('/')[2]);}
    else{renderHome();}
  }

  new MutationObserver(()=>{const g=qs('#grid');if(g)g.classList.add('okobs-grid');})
    .observe(app,{childList:true,subtree:true});
  window.addEventListener('hashchange',router);
  router();
})();
// 🔴 main.js
