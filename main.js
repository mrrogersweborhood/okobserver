// 🟢 main.js — Build 2025-11-06 SR1-fixB2
(function(){
  'use strict';
  const BUILD='2025-11-06SR1-fixB2';
  const API_BASE='https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PAGE_SIZE=12;

  const SS={
    FEED_IDS:'okob.feed.ids',FEED_BYID:'okob.feed.byid',FEED_PAGE:'okob.feed.page',
    FEED_END:'okob.feed.end',SCROLL_Y:'okob.scrollY',ACTIVE_ID:'okob.activeId',
    ACTIVE_PATH:'okob.activePath',RETURN_TOKEN:'okob.returnToken'
  };

  let route='home',page=1,loading=false,reachedEnd=false,RESTORING=false;
  const app=document.getElementById('app');
  const sentinel=document.getElementById('sentinel');
  const feedIds=[],feedById=Object.create(null),seenIds=new Set();
  const fmtDate=d=>new Date(d).toLocaleDateString();

  // --- helpers ---
  function isCartoon(p){
    const groups=p?._embedded?.['wp:term']||[];
    const cats=groups.flat().map(t=>(t?.slug||t?.name||'').toLowerCase());
    return cats.includes('cartoon');
  }
  function imgHTML(p){
    const fm=p._embedded?.['wp:featuredmedia']?.[0];
    const sizes=fm?.media_details?.sizes||{};
    const best=sizes.large||sizes.medium_large||sizes.medium||sizes.full;
    let src=(best?.source_url||fm?.source_url||'')||'';
    if(src)src+=(src.includes('?')?'&':'?')+'cb='+p.id;
    return src?`<img src="${src}" alt="" loading="lazy">`:'';
  }
  const cardHTML=p=>`
    <article class="post-card" data-id="${p.id}">
      <a class="title-link" href="#/post/${p.id}">
        <div class="thumb">${imgHTML(p)}</div>
        <h2 class="post-title">${p.title?.rendered||''}</h2>
      </a>
      <div class="byline">${p._embedded?.author?.[0]?.name||'Oklahoma Observer'} · ${fmtDate(p.date)}</div>
      <div class="post-summary">${p.excerpt?.rendered||''}</div>
    </article>`;

  function ensureFeed(){
    let feed=document.querySelector('.posts-grid');
    if(!feed){feed=document.createElement('div');feed.className='posts-grid';app.innerHTML='';app.appendChild(feed);}
    return feed;
  }

  // --- observer ---
  let io;
  function placeSentinelAfterLastCard(){
    if(RESTORING||route!=='home')return;
    const feed=document.querySelector('.posts-grid');if(!feed)return;
    if(!document.body.contains(sentinel))document.body.appendChild(sentinel);
    feed.appendChild(sentinel);sentinel.style.minHeight='2px';sentinel.style.display='block';
  }
  function attachObserver(){
    if(io)io.disconnect();
    io=new IntersectionObserver(async e=>{
      const entry=e[0];
      if(!entry||!entry.isIntersecting||RESTORING||loading||reachedEnd||route!=='home')return;
      await loadNext();
    },{root:null,rootMargin:'1800px 0 1400px 0',threshold:0});
    placeSentinelAfterLastCard();io.observe(sentinel);
  }
  function detachObserver(){
    if(io){try{io.disconnect();}catch{}io=null;}
    try{if(sentinel&&sentinel.parentNode)sentinel.parentNode.removeChild(sentinel);}catch{}
  }
  function kick(){
    if(RESTORING||route!=='home'||loading||reachedEnd)return;
    const doc=document.documentElement;
    if(doc.scrollHeight-(doc.scrollTop+window.innerHeight)<900)loadNext();
  }
  setInterval(kick,1500);addEventListener('scroll',kick,{passive:true});

  // --- snapshot ---
  function saveFeedSnapshotData({ids,byId,nextPage,reachedEnd:e}){
    try{
      sessionStorage.setItem(SS.FEED_IDS,JSON.stringify(ids||[]));
      const slim={};(ids||[]).forEach(id=>{
        const p=byId[id];if(!p)return;
        slim[id]={id:p.id,date:p.date,title:p.title,excerpt:p.excerpt,_embedded:p._embedded};
      });
      sessionStorage.setItem(SS.FEED_BYID,JSON.stringify(slim));
      sessionStorage.setItem(SS.FEED_PAGE,String(nextPage||1));
      sessionStorage.setItem(SS.FEED_END,String(!!e));
      sessionStorage.setItem(SS.SCROLL_Y,String(window.scrollY||0));
    }catch(err){console.warn('snapshot save failed',err);}
  }
  function readFeedSnapshotData(){
    try{
      const ids=JSON.parse(sessionStorage.getItem(SS.FEED_IDS)||'[]');
      const byId=JSON.parse(sessionStorage.getItem(SS.FEED_BYID)||'{}');
      if(!ids.length)return null;
      return{ids,byId};
    }catch{return null;}
  }

  // --- fetch / append ---
  async function fetchPosts(n){
    const r=await fetch(`${API_BASE}/posts?per_page=${PAGE_SIZE}&page=${n}&_embed=1&orderby=date&order=desc&status=publish`);
    if(!r.ok){
      if([400,404].includes(r.status))return{posts:[],rawCount:0,end:true};
      throw new Error(r.status);
    }
    const raw=await r.json();
    const posts=raw.filter(p=>!isCartoon(p)&&!seenIds.has(p.id));
    return{posts,rawCount:raw.length,end:!raw.length};
  }
  function appendPosts(posts){
    const feed=ensureFeed();const frag=document.createDocumentFragment();
    posts.forEach(p=>{
      if(seenIds.has(p.id))return;
      seenIds.add(p.id);feedIds.push(p.id);feedById[p.id]=p;
      const w=document.createElement('div');w.innerHTML=cardHTML(p);
      const c=w.firstElementChild;c.style.opacity='0';c.style.transition='opacity .25s';
      frag.appendChild(c);requestAnimationFrame(()=>c.style.opacity='1');
    });
    if(frag.childNodes.length)feed.appendChild(frag);
    placeSentinelAfterLastCard();wireCardClicks(feed);
  }
  async function loadNext(){
    if(RESTORING||route!=='home'||loading||reachedEnd)return;
    loading=true;
    try{
      let appended=0,hops=0;
      while(!reachedEnd&&hops<4&&appended<6){
        const{posts,rawCount,end}=await fetchPosts(page);
        if(end||!rawCount){reachedEnd=true;break;}
        if(posts.length){appendPosts(posts);appended+=posts.length;}
        page++;hops++;
      }
      saveFeedSnapshotData({ids:feedIds,byId:feedById,nextPage:page,reachedEnd});
    }finally{loading=false;}
  }

  // --- clicks ---
  function wireCardClicks(scope){
    (scope||document).querySelectorAll('.post-card a.title-link').forEach(a=>{
      a.addEventListener('click',e=>{
        e.preventDefault();
        const href=a.getAttribute('href');const id=href.split('/').pop();
        saveFeedSnapshotData({ids:feedIds,byId:feedById,nextPage:page,reachedEnd});
        try{
          sessionStorage.setItem(SS.SCROLL_Y,String(window.scrollY||0));
          sessionStorage.setItem(SS.RETURN_TOKEN,String(Date.now()));
        }catch{}
        sessionStorage.setItem(SS.ACTIVE_ID,String(id));
        sessionStorage.setItem(SS.ACTIVE_PATH,href);
        navigateTo(href);
      });
    });
  }

  // --- sanitize / detail ---
  function sanitizePostHTML(html){
    const wrap=document.createElement('div');wrap.innerHTML=html;
    wrap.querySelectorAll('a').forEach(a=>{
      const onlyImg=a.children.length===1&&a.firstElementChild?.tagName==='IMG'&&!a.textContent.trim();
      if(onlyImg)a.replaceWith(a.firstElementChild);
    });
    wrap.querySelectorAll('img').forEach(img=>{
      img.removeAttribute('width');img.removeAttribute('height');
      img.style.maxWidth='100%';img.style.height='auto';img.style.display='block';
    });
    wrap.querySelectorAll('video').forEach(v=>{
      if(!v.getAttribute('controls'))v.setAttribute('controls','');
      v.setAttribute('playsinline','');
      v.style.maxWidth=v.style.maxWidth||'100%';
      v.style.height=v.style.height||'auto';
      v.style.display=v.style.display||'block';
      if(!v.style.margin)v.style.margin='12px auto';
      if(!v.style.borderRadius)v.style.borderRadius='8px';
    });
    return wrap.innerHTML;
  }

  async function renderDetail(id){
    document.body.dataset.route='post';
    try{sessionStorage.setItem(SS.SCROLL_Y,String(window.scrollY||0));}catch{}
    route='post';detachObserver();
    const feed=document.querySelector('.posts-grid');if(feed)feed.remove();
    app.innerHTML='<div>Loading…</div>';
    try{
      const r=await fetch(`${API_BASE}/posts/${id}?_embed=1`);
      if(!r.ok){app.innerHTML='<p>Not found.</p>';return;}
      const p=await r.json();const cleaned=sanitizePostHTML(p.content?.rendered||'');

      // --- inline video (DOM parser version) ---
      let videoEmbed='';const rawHTML=p.content?.rendered||'';
      const parser=new DOMParser();const doc=parser.parseFromString(rawHTML,'text/html');
      const iframe=doc.querySelector('iframe[src]');
      if(iframe){
        const src=iframe.getAttribute('src')||'';
        if(src)videoEmbed=`<div class="video-container" style="margin:12px 0;">
          <iframe src="${src}" frameborder="0" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
        </div>`;
      }else{
        const hrefs=Array.from(doc.querySelectorAll('a[href]')).map(a=>a.href);
        const textMp4=(rawHTML.match(/https?:\/\/\S+?\.mp4\b/i)||[])[0]||'';
        const yt=hrefs.find(h=>/youtube\.com\/watch\?v=|youtu\.be\//i.test(h));
        const vi=hrefs.find(h=>/vimeo\.com\/\d+/i.test(h));
        const fb=hrefs.find(h=>/facebook\.com\//i.test(h));
        const videoTag=doc.querySelector('video');
        const mp4Source=doc.querySelector('source[src$=".mp4"], source[src*=".mp4?"]');
        const mp4Url=mp4Source?.getAttribute('src')||textMp4;
        if(yt){
          const id=(yt.match(/v=([A-Za-z0-9_-]{6,})/)||[])[1]||(yt.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/)||[])[1];
          if(id)videoEmbed=`<div class="video-container" style="margin:12px 0;">
            <iframe src="https://www.youtube.com/embed/${id}" frameborder="0" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
          </div>`;
        }else if(vi){
          const vid=(vi.match(/vimeo\.com\/(\d+)/)||[])[1];
          if(vid)videoEmbed=`<div class="video-container" style="margin:12px 0;">
            <iframe src="https://player.vimeo.com/video/${vid}" frameborder="0" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
          </div>`;
        }else if(videoTag){
          const tmp=document.createElement('div');tmp.appendChild(videoTag.cloneNode(true));
          const html=tmp.innerHTML.replace(/<video/i,'<video playsinline controls style="max-width:100%;height:auto;border-radius:8px;display:block;margin:12px auto;"');
          videoEmbed=`<div class="video-html5" style="margin:12px 0;">${html}</div>`;
        }else if(mp4Url){
          const poster=p._embedded?.['wp:featuredmedia']?.[0]?.source_url||'';
          const posterAttr=poster?` poster="${poster}"`:'';
          videoEmbed=`<div class="video-html5" style="margin:12px 0;">
            <video playsinline controls${posterAttr} style="max-width:100%;height:auto;border-radius:8px;display:block;margin:12px auto;">
              <source src="${mp4Url}" type="video/mp4">
              Your browser does not support the video tag.
            </video>
          </div>`;
        }else if(fb){
          const fm=p._embedded?.['wp:featuredmedia']?.[0];
          const img=fm?.source_url?`<img src="${fm.source_url}" alt="Facebook video" style="max-width:100%;height:auto;border-radius:8px;">`:'';
          const btn=`<p style="margin-top:10px;"><a href="${fb}" target="_self" class="fb-btn" style="display:inline-block;background:#1E90FF;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">View on Facebook</a></p>`;
          videoEmbed=`<div class="video-fallback" style="text-align:center;margin:20px 0;">${img}${btn}</div>`;
        }
      }

      const hero=videoEmbed||`<div class="post-hero" style="margin:0 0 16px 0;"><div class="thumb">${imgHTML(p)}</div></div>`;
      app.innerHTML=`<article class="post-detail">
        ${hero}
        <h1 class="post-detail__title" style="color:#1E90FF;margin:0 0 8px;">${p.title?.rendered||''}</h1>
        <div class="byline" style="font-weight:600;margin:0 0 16px;">${p._embedded?.author?.[0]?.name||'Oklahoma Observer'} · ${fmtDate(p.date)}</div>
        <div class="post-detail__content">${cleaned}</div>
        <p style="margin-top:24px;"><a class="button" href="#/">Back to Posts</a></p>
      </article>`;
      const back=app.querySelector('.button[href="#/"]');
      if(back)back.addEventListener('click',e=>{e.preventDefault();navigateTo('#/');});
    }catch(err){console.warn(err);app.innerHTML='<p>Error loading post.</p>';}
  }

  async function renderHome(){
    detachObserver();document.body.dataset.route='home';
    const snap=readFeedSnapshotData();
    if(snap){
      RESTORING=true;route='home';
      feedIds.length=0;seenIds.clear();for(const k in feedById)delete feedById[k];
      const list=snap.ids.map(id=>snap.byId[id]).filter(Boolean);
      list.forEach(p=>{feedIds.push(p.id);feedById[p.id]=p;seenIds.add(p.id);});
      app.innerHTML='';const feed=ensureFeed();feed.innerHTML=list.map(cardHTML).join('');
      wireCardClicks(feed);placeSentinelAfterLastCard();
      page=Math.max(1,Number(sessionStorage.getItem(SS.FEED_PAGE)||'1'));
      reachedEnd=sessionStorage.getItem(SS.FEED_END)==='true';loading=false;
      const y=Number(sessionStorage.getItem(SS.SCROLL_Y)||'0');
      requestAnimationFrame(()=>{requestAnimationFrame(()=>{window.scrollTo(0,y);attachObserver();RESTORING=false;kick();});});
      return;
    }
    route='home';RESTORING=false;app.innerHTML='';ensureFeed();
    feedIds.length=0;for(const k in feedById)delete feedById[k];
    seenIds.clear();page=1;reachedEnd=false;loading=false;
    await loadNext();attachObserver();
  }

  // --- router ---
  function currentRoute(){
    const h=location.hash||'#/';if(h.startsWith('#/post/'))return{name:'post',id:h.split('/').pop()};
    return{name:'home'};
  }
  async function router(){
    const r=currentRoute();route=r.name;document.body.dataset.route=route;
    if(r.name==='post')await renderDetail(r.id);else await renderHome();
  }
  function navigateTo(hash){if(location.hash===hash)router();else location.hash=hash;}

  window.addEventListener('hashchange',router);
  window.addEventListener('DOMContentLoaded',()=>{
    const v=document.getElementById('build-version');if(v)v.textContent='Build '+BUILD;
    router();
  });
  console.log('[OkObserver] main.js loaded:',BUILD);
})();
// 🔴 main.js — Build 2025-11-06 SR1-fixB2
