/* 🟢 main.js — Build 2025-11-03R1c */
(function () {
  'use strict';
  window.AppVersion = '2025-11-03R1c';
  console.log('%c[OkObserver] Now running main.js Build ' + window.AppVersion,
              'color:#1E90FF;font-weight:bold');

  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PAGE_SIZE = 12;
  const MAX_CARDS = 60;
  let page = 1, loading = false, reachedEnd = false, route = 'home';
  const cachePages = new Map(), lruKeys = [];

  const app = document.getElementById('app');
  const sentinel = document.getElementById('sentinel');
  const menu = document.getElementById('menu');
  const hamburger = document.getElementById('hamburger');

  const fmtDate = iso => new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
  const isCartoon = p => (p.title?.rendered||'').toLowerCase().includes('cartoon');
  const byline = p => `${p._embedded?.author?.[0]?.name||'Staff'} · ${fmtDate(p.date)}`;
  const getFeaturedId = p => p.featured_media || p.featured_media_id || null;

  const buildImgHtml = (id, pid) =>
    id ? `<img src="${API_BASE}/media/${id}?cb=${pid}" decoding="async" loading="lazy" alt=""
            style="width:100%;height:auto;display:block;border:0;background:#fff;">` : '';

  const excerptHtml = p => `<div class="post-summary">${p.excerpt?.rendered||''}</div>`;

  const rememberPage = (p,posts)=>{
    if(cachePages.has(p))lruKeys.splice(lruKeys.indexOf(p),1);
    cachePages.set(p,posts);lruKeys.push(p);
    while(lruKeys.length>6)cachePages.delete(lruKeys.shift());
  };

  const removeOldCards=()=>{
    const c=document.querySelector('.posts-grid');
    if(!c)return;while(c.children.length>MAX_CARDS)c.removeChild(c.firstElementChild);
  };

  const ensureFeed=()=>{
    let f=document.querySelector('.posts-grid');
    if(!f){f=document.createElement('div');f.className='posts-grid';app.innerHTML='';app.appendChild(f);}
    return f;
  };

  const cardHtml=p=>{
    const pid=p.id,mid=getFeaturedId(p);
    return `<article class="post-card" data-id="${pid}">
      <a class="title-link" href="#/post/${pid}">
        <div class="thumb">${buildImgHtml(mid,pid)}</div>
        <h2 class="post-title">${p.title?.rendered||''}</h2>
        <div class="byline">${byline(p)}</div>
        ${excerptHtml(p)}
      </a>
    </article>`;
  };

  const renderPostsPage=posts=>{
    const f=ensureFeed();f.insertAdjacentHTML('beforeend',posts.map(cardHtml).join(''));removeOldCards();
  };

  const renderAbout=()=>app.innerHTML=`<section class="oo-about"><h1>About</h1>
    <p>Independent journalism since 1969 – Tips: <a href="mailto:okobserver@outlook.com">okobserver@outlook.com</a></p></section>`;
  const renderSettings=()=>app.innerHTML=`<section class="oo-settings"><h1>Settings</h1>
    <p>Current build <strong>${window.AppVersion}</strong></p></section>`;

  const renderDetail=async id=>{
    app.innerHTML=`<div class="oo-detail--loading">Loading…</div>`;
    try{
      const r=await fetch(`${API_BASE}/posts/${id}`),p=await r.json();
      app.innerHTML=`<article class="oo-detail">
        <h1 class="oo-detail__title">${p.title?.rendered||''}</h1>
        <div class="oo-detail__byline">${byline(p)}</div>
        <div class="post-hero">${buildImgHtml(getFeaturedId(p),id)}</div>
        <div class="oo-detail__content">${p.content?.rendered||''}</div>
        <div class="oo-detail__back"><a class="button" href="#/">Back to Posts</a></div>
      </article>`;
    }catch{app.innerHTML=`<div class="oo-error">Failed to load post.</div>`;}
  };

  const fetchPosts=async n=>{
    const r=await fetch(`${API_BASE}/posts?per_page=${PAGE_SIZE}&page=${n}&_embed=1`);
    if(!r.ok){if(r.status===400||r.status===404)reachedEnd=true;throw new Error(r.status);}
    return (await r.json()).filter(p=>!isCartoon(p));
  };

  const loadNextPage=async()=>{
    if(loading||reachedEnd||route!=='home')return;
    loading=true;
    try{const ps=await fetchPosts(page);if(!ps.length){reachedEnd=true;return;}
      rememberPage(page,ps);renderPostsPage(ps);page++;}
    finally{loading=false;}
  };

  const router=async()=>{
    const h=location.hash||'#/';const p=h.slice(2).split('/');
    switch(p[0]){
      case'':case'posts':route='home';ensureFeed();break;
      case'about':route='about';return renderAbout();
      case'settings':route='settings';return renderSettings();
      case'post':route='detail';return await renderDetail(p[1]);
      default:route='home';ensureFeed();break;
    }
  };

  const io=new IntersectionObserver(async e=>{
    const f=e[0];if(!f.isIntersecting||loading)return;await loadNextPage();
  },{rootMargin:'1200px 0px 800px 0px',threshold:0});

  const toggleMenu=()=>{
    const open=!menu.hasAttribute('hidden');
    if(open){menu.setAttribute('hidden','');hamburger.setAttribute('aria-expanded','false');}
    else{menu.removeAttribute('hidden');hamburger.setAttribute('aria-expanded','true');}
  };

  const start=async()=>{
    window.addEventListener('hashchange',router);
    hamburger?.addEventListener('click',toggleMenu);
    await router();
    if(route==='home'){io.observe(sentinel);await loadNextPage();}
  };
  start();
})();
 /* 🔴 main.js */
