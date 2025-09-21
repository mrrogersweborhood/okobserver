// home.js — home grid + infinite scroll
import { BASE, PER_PAGE, EXCLUDE_CAT, state, saveHomeCache, isHomeRoute, app, controllers, setRestoring, isRestoring, nextFrame } from './shared.js';
import { esc, decodeEntities, ordinalDate, normalizeContent, hardenLinks, whenImagesSettled, showError } from './utils.js';

function getAuthor(p){ return p?._embedded?.author?.[0]?.name || ""; }
function hasExcluded(p){
  const groups=p?._embedded?.["wp:term"]||[];
  const cats=groups.flat().filter(t=>(t?.taxonomy||"").toLowerCase()==="category");
  const norm=(x)=>(x||"").trim().toLowerCase();
  return cats.some(c=>norm(c.slug)===EXCLUDE_CAT || norm(c.name)===EXCLUDE_CAT);
}

export function buildCardElement(post){
  const card = document.createElement("div");
  card.className = "card";
  const fm = (post?._embedded?.["wp:featuredmedia"]?.[0])||null;
  let imgSrc = "";
  if (fm){
    const sizes=fm.media_details?.sizes||{};
    const order=["2048x2048","1536x1536","large","medium_large","medium","thumbnail"];
    const best = order.map(k=>sizes[k]).find(s=>s?.source_url) || null;
    imgSrc = best?.source_url || fm.source_url || "";
  } else {
    const div=document.createElement("div"); div.innerHTML=post?.content?.rendered||"";
    const img=div.querySelector("img"); if(img){ imgSrc = img.getAttribute("data-src")||img.getAttribute("src")||""; }
  }
  const author = getAuthor(post) || "";
  const date = ordinalDate(post.date);
  const excerpt = decodeEntities((post?.excerpt?.rendered||"").replace(/<[^>]+>/g,"").trim());
  const postHref = `#/post/${post.id}`;
  const titleHTML = (post?.title?.rendered || "Untitled");

  card.innerHTML = `
    ${imgSrc
      ? `<a class="thumb-link" href="${esc(postHref)}" data-id="${post.id}" aria-label="Open post">
           <img src="${esc(imgSrc)}" alt="${esc(titleHTML)}" class="thumb" loading="lazy" decoding="async" fetchpriority="low" sizes="(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 33vw" />
         </a>`
      : `<div class="thumb" aria-hidden="true"></div>`}
    <div class="card-body">
      <h3 class="title"><a class="title-link" href="${esc(postHref)}" data-id="${post.id}">${titleHTML}</a></h3>
      <div class="meta-author-date"><strong class="author">${esc(author)}</strong><span class="date">${date}</span></div>
      <p class="excerpt">${esc(excerpt)}</p>
    </div>`;
  return card;
}

function getGrid(){
  if (!isHomeRoute()) return null;
  let grid = document.getElementById("grid");
  if(!grid){
    grid = document.createElement("div");
    grid.id="grid"; grid.className="grid";
    app().appendChild(grid);
  }
  return grid;
}
function getLoader(){
  let ld = document.getElementById("infiniteLoader");
  if(!ld){
    ld = document.createElement("div");
    ld.id="infiniteLoader"; ld.className="infinite-loader";
    ld.innerHTML = '<span class="spinner" aria-hidden="true"></span> Loading…';
    ld.style.display="none"; app().appendChild(ld);
  }
  return ld;
}
function showLoader(){ getLoader().style.display="flex"; }
function hideLoader(){ const ld=document.getElementById("infiniteLoader"); if(ld) ld.style.display="none"; }
function getSentinel(){
  let s = document.getElementById("scrollSentinel");
  if(!s){ s=document.createElement("div"); s.id="scrollSentinel"; s.style.cssText="height:1px;width:100%;"; app().appendChild(s); }
  else { app().appendChild(s); }
  return s;
}

export function renderGridFromPosts(posts, append=false){
  const grid = getGrid(); if(!grid) return;
  if(!append) grid.innerHTML="";
  const frag=document.createDocumentFragment();
  (posts||[]).forEach(p=>{ if(p && !hasExcluded(p)) frag.appendChild(buildCardElement(p)); });
  grid.appendChild(frag);
  getLoader();
  const s = getSentinel();
  if (state._io && typeof state._io.observe === 'function'){
    if (state._sentinel && state._sentinel !== s){ try{ state._io.unobserve(state._sentinel);}catch{} }
    state._io.observe(s); state._sentinel = s;
  } else {
    state._io=null; state._sentinel=null; ensureInfiniteScroll();
  }
}

export async function loadNextPage(){
  if (!isHomeRoute()) return;
  if (isRestoring()) return;
  if (state.isLoading) return;
  if (Number.isFinite(state.totalPages) && state.page >= state.totalPages) return;

  if (controllers.listAbort){ try{ controllers.listAbort.abort(); }catch{} }
  controllers.listAbort = new AbortController();

  state.isLoading=true; saveHomeCache(); showLoader();
  try{
    const next=(state.page||1)+1;
    const url = `${BASE}/posts?per_page=${PER_PAGE}&page=${next}&_embed=1`;
    const res = await fetch(url, { headers:{Accept:"application/json"}, signal: controllers.listAbort.signal });
    if(!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
    const newPosts = await res.json();
    const existingIds=new Set((state.posts||[]).map(p=>p?.id));
    const add=[];
    for (const p of newPosts){ if(!p||existingIds.has(p.id)||hasExcluded(p)) continue; add.push(p); existingIds.add(p.id); }
    state.posts=(state.posts||[]).concat(add);
    state.page=next;
    const tp=Number(res.headers.get("X-WP-TotalPages"));
    if(Number.isFinite(tp)&&tp>0) state.totalPages=tp;
    else if(Array.isArray(newPosts)&&newPosts.length<PER_PAGE) state.totalPages=state.page;
    saveHomeCache(); renderGridFromPosts(add, true);
  }catch(err){ if(err?.name!=='AbortError') showError(err); }
  finally{ hideLoader(); state.isLoading=false; saveHomeCache(); }
}

export function ensureInfiniteScroll(){
  const sentinel = getSentinel();
  if (state._io && typeof state._io.observe === 'function'){
    if (state._sentinel && state._sentinel !== sentinel){ try{ state._io.unobserve(state._sentinel);}catch{} }
    state._io.observe(sentinel); state._sentinel = sentinel; return;
  }
  const io=new IntersectionObserver((entries)=>{
    const e=entries[0];
    if(!e||!e.isIntersecting) return;
    if(!isHomeRoute()) return;
    if (isRestoring()) return;
    loadNextPage();
  }, { root:null, rootMargin:"1000px 0px", threshold:0 });
  io.observe(sentinel);
  state._io = io; state._sentinel = sentinel; state._ioAttached = true;
}

export async function renderHome(){
  if (!app()) return;

  if (state.returningFromDetail && Array.isArray(state.posts) && state.posts.length){
    setRestoring(true);
    const targetY = (typeof state.homeScrollY === "number" ? state.homeScrollY : state.scrollY) || 0;
    const wantAnchor = !targetY && state.scrollAnchorPostId;

    const rootEl=document.documentElement, body=document.body;
    const prevHeight=Math.max(body.scrollHeight, rootEl.scrollHeight);
    const prevScrollBehavior=rootEl.style.scrollBehavior;
    app().style.minHeight = prevHeight + "px";
    rootEl.style.scrollBehavior = "auto";
    rootEl.style.setProperty("overflow-anchor","none");

    app().innerHTML = "";
    renderGridFromPosts(state.posts,false);
    ensureInfiniteScroll();

    (async ()=>{
      try{
        const grid=document.getElementById("grid");
        await nextFrame();
        if (targetY > 0) window.scrollTo(0, targetY);
        else if (wantAnchor){ const el=document.querySelector(`[data-id="${state.scrollAnchorPostId}"]`); (el?.closest(".card")||el)?.scrollIntoView({block:"start"}); }
        await whenImagesSettled(grid,2000);
        await nextFrame();
        if (targetY > 0) window.scrollTo(0, targetY);
        else if (wantAnchor){ const el2=document.querySelector(`[data-id="${state.scrollAnchorPostId}"]`); (el2?.closest(".card")||el2)?.scrollIntoView({block:"start"}); }
      } finally {
        app().style.minHeight = "";
        document.documentElement.style.removeProperty("overflow-anchor");
        document.documentElement.style.scrollBehavior = prevScrollBehavior || "";
        state.returningFromDetail=false; setRestoring(false); saveHomeCache();
      }
    })();
    return;
  }

  app().innerHTML = `<p class="center">Loading…</p>`;
  if (controllers.listAbort){ try{ controllers.listAbort.abort(); }catch{} }
  controllers.listAbort = new AbortController();

  async function fetchPage(pageNum){
    const url = `${BASE}/posts?per_page=${PER_PAGE}&page=${pageNum}&_embed=1`;
    const res = await fetch(url, { headers:{Accept:"application/json"}, signal: controllers.listAbort.signal });
    if(!res.ok){
      const text=await res.text().catch(()=> "");
      const err=new Error(`API Error ${res.status}${res.statusText?`: ${res.statusText}`:""}`); err.details=text?.slice(0,300);
      throw err;
    }
    const data=await res.json(); return { data, res };
  }

  try{
    let data, res;
    try{ ({data, res} = await fetchPage(1)); }
    catch(e1){
      if(e1?.name==='AbortError' || controllers.listAbort.signal.aborted) return;
      console.warn("[OkObserver] First attempt failed, retrying fallback:", e1);
      if (controllers.listAbort){ try{ controllers.listAbort.abort(); }catch{} }
      controllers.listAbort = new AbortController();
      const fallbackUrl = `${BASE}/posts?per_page=${PER_PAGE}&page=1&_fields=id,date,title,excerpt,content,link`;
      const res2 = await fetch(fallbackUrl, { headers:{Accept:"application/json"}, signal: controllers.listAbort.signal });
      if(!res2.ok){
        const text=await res2.text().catch(()=> "");
        const err=new Error(`API Error ${res2.status}${res2.statusText?`: ${res2.statusText}`:""}`); err.details=text?.slice(0,300);
        throw err;
      }
      data = await res2.json(); res = res2;
    }

    const posts = Array.isArray(data) ? data : [];
    if (!posts.length){
      app().innerHTML=""; showError("No posts returned from the server.");
      renderGridFromPosts([], false); ensureInfiniteScroll(); return;
    }

    app().innerHTML=""; renderGridFromPosts(posts,false); ensureInfiniteScroll();
    state.posts = posts.filter(p=>p && !hasExcluded(p));
    state.page = 1;
    const tp = Number(res.headers?.get?.("X-WP-TotalPages"));
    state.totalPages = Number.isFinite(tp)&&tp>0 ? tp : null;
    state.scrollY = 0; state.homeScrollY=0; state.scrollAnchorPostId=null; state.isLoading=false;
    saveHomeCache();
  } catch(err){
    if (err?.name !== 'AbortError'){
      console.error("[OkObserver] Home load failed:", err, err?.details || "");
      showError(err?.message || err);
      if (err?.details) showError(err.details);
    }
    app().innerHTML=""; renderGridFromPosts([], false);
  }
}

// Fallback paginator if IO is missing/throttled
export function attachScrollFallback(){
  window.addEventListener('scroll', function () {
    if (!isHomeRoute()) return;
    if (isRestoring()) return;
    if (state.isLoading) return;
    const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 800);
    if (nearBottom) {
      if (!state._io || typeof state._io.observe !== 'function') ensureInfiniteScroll();
      loadNextPage();
    }
  }, { passive: true });
}
