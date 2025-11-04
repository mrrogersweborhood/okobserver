// 🟢 main.js
(function(){
  'use strict';

  const BUILD = '2025-11-04SR1';
  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PAGE_SIZE = 12;

  const SS = {
    FEED_IDS:   'okob.feed.ids',
    FEED_BYID:  'okob.feed.byid',
    FEED_PAGE:  'okob.feed.page',
    FEED_END:   'okob.feed.end',
    SCROLL_Y:   'okob.scrollY',
    ACTIVE_ID:  'okob.activeId',
    ACTIVE_PATH:'okob.activePath',
    RETURN_TOKEN:'okob.returnToken'
  };

  let route = 'home';
  let page = 1;
  let loading = false;
  let reachedEnd = false;

  const app = document.getElementById('app');
  const sentinel = document.getElementById('sentinel');

  const feedIds = [];
  const feedById = Object.create(null);
  const seenIds = new Set();

  const fmtDate = d => new Date(d).toLocaleDateString();

  function isCartoon(p){
    const groups = p?._embedded?.['wp:term'] || [];
    const cats = groups.flat().map(t => (t?.slug||t?.name||'').toString().toLowerCase());
    return cats.includes('cartoon');
  }

  function imgHTML(p){
    let src = null;
    const fm = p._embedded?.['wp:featuredmedia']?.[0];
    const sizes = fm?.media_details?.sizes || {};
    const best = sizes.large || sizes.medium_large || sizes.medium || sizes.full;
    src = (best?.source_url || fm?.source_url || null);
    if (src) src += (src.includes('?') ? '&' : '?') + 'cb=' + p.id;
    return src ? `<img src="${src}" alt="" loading="lazy">` : '';
  }

  const cardHTML = p => `
    <article class="post-card" data-id="${p.id}">
      <a class="title-link" href="#/post/${p.id}">
        <div class="thumb">${imgHTML(p)}</div>
        <h2 class="post-title">${p.title?.rendered || ''}</h2>
      </a>
      <div class="byline">${p._embedded?.author?.[0]?.name || 'Oklahoma Observer'} · ${fmtDate(p.date)}</div>
      <div class="post-summary">${p.excerpt?.rendered || ''}</div>
    </article>`;

  function ensureFeed(){
    let feed = document.querySelector('.posts-grid');
    if (!feed) {
      feed = document.createElement('div');
      feed.className = 'posts-grid';
      app.innerHTML = '';
      app.appendChild(feed);
    }
    return feed;
  }

  const MAX_CARDS = 400;
  function trimCards(){
    const c = document.querySelector('.posts-grid'); if (!c) return;
    while (c.children.length > MAX_CARDS) c.removeChild(c.firstElementChild);
  }

  function placeSentinelAfterLastCard(){
    const feed = document.querySelector('.posts-grid'); if (!feed) return;
    if (!document.body.contains(sentinel)) document.body.appendChild(sentinel);
    feed.appendChild(sentinel);
    sentinel.style.minHeight = '2px';
    sentinel.style.display = 'block';
  }

  function wireCardClicks(scope){
    (scope || document).querySelectorAll('.post-card a.title-link').forEach(a=>{
      a.addEventListener('click', e=>{
        e.preventDefault();
        const href = a.getAttribute('href'); 
        const id = href.split('/').pop();
        saveFeedSnapshotData({
          ids: feedIds,
          byId: feedById,
          nextPage: page,
          reachedEnd
        });
        sessionStorage.setItem(SS.ACTIVE_ID, String(id));
        sessionStorage.setItem(SS.ACTIVE_PATH, href);
        sessionStorage.setItem(SS.RETURN_TOKEN, String(Date.now()));
        navigateTo(href);
      }, { passive:false });
    });
  }

  function saveFeedSnapshotData({ ids, byId, nextPage, reachedEnd: endFlag }) {
    try {
      sessionStorage.setItem(SS.FEED_IDS, JSON.stringify(ids||[]));
      const slim = {};
      (ids||[]).forEach(id => {
        const p = byId[id]; if (!p) return;
        slim[id] = {
          id:p.id, date:p.date, title:p.title, excerpt:p.excerpt,
          _embedded:p._embedded
        };
      });
      sessionStorage.setItem(SS.FEED_BYID, JSON.stringify(slim));
      sessionStorage.setItem(SS.FEED_PAGE, String(nextPage||1));
      sessionStorage.setItem(SS.FEED_END, String(!!endFlag));
      sessionStorage.setItem(SS.SCROLL_Y, String(window.scrollY||0));
    } catch(e){ console.warn('snapshot save failed', e); }
  }

  function readFeedSnapshotData(){
    try{
      const ids = JSON.parse(sessionStorage.getItem(SS.FEED_IDS)||'[]');
      const byId = JSON.parse(sessionStorage.getItem(SS.FEED_BYID)||'{}');
      if (!Array.isArray(ids) || !ids.length) return null;
      return { ids, byId };
    } catch { return null; }
  }

  function clearFeedSnapshotData(){
    [SS.FEED_IDS,SS.FEED_BYID,SS.FEED_PAGE,SS.FEED_END,SS.SCROLL_Y]
      .forEach(k=>sessionStorage.removeItem(k));
  }

  window.addEventListener('pageshow', ()=>{
    if (performance?.navigation?.type === 1) clearFeedSnapshotData();
  });

  async function fetchPosts(n){
    const r = await fetch(`${API_BASE}/posts?per_page=${PAGE_SIZE}&page=${n}&_embed=1&orderby=date&order=desc&status=publish`);
    if (!r.ok) {
      if (r.status===400 || r.status===404) return { posts:[], rawCount:0, end:true };
      throw new Error(r.status);
    }
    const raw = await r.json();
    const rawCount = Array.isArray(raw) ? raw.length : 0;
    const posts = raw.filter(p => !isCartoon(p)).filter(p => !seenIds.has(p.id));
    return { posts, rawCount, end: rawCount===0 };
  }

  function appendPosts(posts){
    posts.forEach(p=>{
      if (seenIds.has(p.id)) return;
      seenIds.add(p.id);
      feedIds.push(p.id);
      feedById[p.id] = p;
    });

    const feed = ensureFeed();
    const frag = document.createDocumentFragment();
    posts.forEach(p=>{
      if (!p || !p.id) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = cardHTML(p);
      const card = wrap.firstElementChild;
      card.style.opacity = '0'; 
      card.style.transition = 'opacity .25s ease';
      frag.appendChild(card);
      requestAnimationFrame(()=> card.style.opacity = '1');
    });
    if (frag.childNodes.length) feed.appendChild(frag);
    trimCards();
    placeSentinelAfterLastCard();
    wireCardClicks(feed);
  }

  let io;
  function attachObserver(){
    if (io) io.disconnect();
    io = new IntersectionObserver(async entries=>{
      const e = entries[0];
      if (!e || !e.isIntersecting || loading || reachedEnd || route!=='home') return;
      await loadNext();
    }, { root:null, rootMargin:'1800px 0px 1400px 0px', threshold:0 });
    placeSentinelAfterLastCard();
    io.observe(sentinel);
  }

  function kick(){
    if (route!=='home' || loading || reachedEnd) return;
    const doc=document.documentElement;
    const remaining = doc.scrollHeight - (doc.scrollTop + window.innerHeight);
    if (remaining < 900) loadNext();
  }

  setInterval(kick, 1500);
  addEventListener('scroll', kick, { passive:true });

  async function loadNext(){
    if (loading || reachedEnd || route!=='home') return;
    loading = true;
    try{
      const MIN_TO_APPEND = 6;
      const MAX_PAGES_HOP = 4;
      let appended = 0, hops = 0;

      while (!reachedEnd && hops < MAX_PAGES_HOP && appended < MIN_TO_APPEND){
        const { posts, rawCount, end } = await fetchPosts(page);
        if (end || rawCount===0){ reachedEnd = true; break; }
        if (posts.length){ appendPosts(posts); appended += posts.length; }
        page += 1; hops += 1;
      }

      saveFeedSnapshotData({ ids:feedIds, byId:feedById, nextPage:page, reachedEnd });
      if (document.documentElement.scrollHeight <= window.innerHeight + 200 && !reachedEnd) {
        (window.requestIdleCallback || setTimeout)(() => loadNext(), 80);
      }
    } finally { loading = false; }
  }

  function notFound(id, status='Not found'){
    app.innerHTML = `<article class="post-detail" style="max-width:880px;margin:0 auto;padding:0 12px;">
      <h1 class="post-detail__title" style="color:#1E90FF;margin:0 0 8px;">Post not found</h1>
      <div class="byline" style="font-weight:600;margin:0 0 16px;">ID ${id} • ${status}</div>
      <p>We couldn’t load this article. It may have been removed or is restricted.</p>
      <p style="margin-top:24px;"><a class="button" href="#/">Back to Posts</a></p>
    </article>`;
  }

  function sanitizePostHTML(html){
    const wrap=document.createElement('div'); wrap.innerHTML=html;
    wrap.querySelectorAll('a').forEach(a=>{
      const onlyImg=a.children.length===1 && a.firstElementChild?.tagName==='IMG' && (a.textContent||'').trim()==='';
      if (onlyImg) a.replaceWith(a.firstElementChild);
    });
    wrap.querySelectorAll('img').forEach(img=>{
      img.removeAttribute('width'); img.removeAttribute('height');
      img.style.maxWidth='100%'; img.style.height='auto'; img.style.display='block';
    });
    return wrap.innerHTML;
  }

  async function renderDetail(id){
    try{
      const y=window.scrollY||0; sessionStorage.setItem(SS.SCROLL_Y,String(y));
    } catch{}
    app.innerHTML = '';
    const orphan = document.querySelector('.posts-grid'); if (orphan) orphan.remove();
    app.innerHTML = '<div>Loading…</div>';
    try{
      const r = await fetch(`${API_BASE}/posts/${id}?_embed=1`);
      if (!r.ok){ notFound(id, `HTTP ${r.status}`); return; }
      const p = await r.json(); if (!p || !p.id){ notFound(id, 'Unavailable'); return; }
      const cleaned = sanitizePostHTML(p.content?.rendered||'');
      const hero = `<div class="post-hero" style="margin:0 0 16px 0;"><div class="thumb">${imgHTML(p)}</div></div>`;
      app.innerHTML = `<article class="post-detail">
        ${hero}
        <h1 class="post-detail__title" style="color:#1E90FF;margin:0 0 8px;">${p.title?.rendered||''}</h1>
        <div class="byline" style="font-weight:600;margin:0 0 16px;">${p._embedded?.author?.[0]?.name || 'Oklahoma Observer'} · ${fmtDate(p.date)}</div>
        <div class="post-detail__content">${cleaned}</div>
        <p style="margin-top:24px;"><a class="button" href="#/">Back to Posts</a></p>
      </article>`;
      const back = app.querySelector('.button[href="#/"]');
      if (back) back.addEventListener('click', e=>{ e.preventDefault(); navigateTo('#/'); });
    } catch(e){ console.warn('Post load failed', e); notFound(id, 'Network error'); }
  }

  async function renderHome(){
    const snap = readFeedSnapshotData();
    if (snap){
      route='home';
      const list = snap.ids.map(id => snap.byId[id]).filter(Boolean);
      feedIds.length = 0; seenIds.clear();
      for (const k in feedById) delete feedById[k];
      list.forEach(p=>{ feedIds.push(p.id); feedById[p.id]=p; seenIds.add(p.id); });

      app.innerHTML = ''; ensureFeed();
      appendPosts([]);
      const feed = ensureFeed(); feed.innerHTML = list.map(cardHTML).join('');
      wireCardClicks(feed);
      placeSentinelAfterLastCard();

      page = Math.max(1, Number(sessionStorage.getItem(SS.FEED_PAGE) || '1'));
      reachedEnd = sessionStorage.getItem(SS.FEED_END) === 'true';
      loading = false;

      const y = Number(sessionStorage.getItem(SS.SCROLL_Y)||'0');
      requestAnimationFrame(()=> window.scrollTo(0, y));

      attachObserver(); kick();
      return;
    }

    route='home';
    app.innerHTML=''; ensureFeed();
    feedIds.length = 0; for (const k in feedById) delete feedById[k];
    seenIds.clear(); page = 1; reachedEnd = false; loading = false;

    await loadNext();
    attachObserver();
  }

  function currentRoute(){
    const h = location.hash || '#/';
    if (h.startsWith('#/post/')) return { name:'post', id: h.split('/').pop() };
    return { name:'home' };
  }

  async function router(){
    const r = currentRoute();
    if (r.name === 'post') await renderDetail(r.id);
    else await renderHome();
  }

  function navigateTo(hash){
    if (location.hash === hash) router();
    else location.hash = hash;
  }

  window.addEventListener('hashchange', router);
  window.addEventListener('DOMContentLoaded', ()=>{
    const v = document.getElementById('build-version');
    if (v) v.textContent = 'Build ' + BUILD;
    router();
  });

  console.log('[OkObserver] main.js loaded:', BUILD);
})();

// 🔴 main.js
