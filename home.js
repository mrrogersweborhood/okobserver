import {
  APP_VERSION, app, state, stateForSave, saveHomeCache,
  showError, esc, nextFrame, whenImagesSettled, ordinalDate,
  isHomeRoute
} from "./common.js";
import { fetchLeanPostsPage, mediaMap, authorMap, mediaInfoFromSizes } from "./api.js";

const BATCH_SIZE = 18;

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
  if(!s){
    s=document.createElement("div");
    s.id="scrollSentinel";
    s.style.cssText="height:1px;width:100%;margin-top:900px";
    app().appendChild(s);
  } else {
    s.style.marginTop = "900px";
    app().appendChild(s);
  }
  return s;
}

function getAuthorName(post){
  return authorMap.get(post.author) ||
         post?._embedded?.author?.[0]?.name || "";
}
function resolveFeatured(post){
  const mId = post.featured_media;
  if (mId && mediaMap.has(mId)) return mediaMap.get(mId);
  const m = post?._embedded?.["wp:featuredmedia"]?.[0];
  return m ? mediaInfoFromSizes(m) : { src:"", width:null, height:null };
}

function buildCardElement(post){
  const card = document.createElement("div");
  card.className = "card";
  const media = resolveFeatured(post);
  const imgSrc = media?.src || "";
  const imgW = media?.width || 600;
  const imgH = media?.height || 360;

  const author = getAuthorName(post) || "";
  const date = ordinalDate(post.date);
  const excerpt = (post?.excerpt?.rendered||"").replace(/<[^>]+>/g,"").trim();
  const postHref = `#/post/${post.id}`;
  const titleHTML = post?.title?.rendered || "Untitled";

  card.innerHTML = `
    ${imgSrc
      ? `<a class="thumb-link" href="${esc(postHref)}" data-id="${post.id}" aria-label="Open post">
           <img src="${esc(imgSrc)}" alt="${esc(titleHTML)}" class="thumb"
                loading="lazy" decoding="async" fetchpriority="low"
                width="${imgW}" height="${imgH}"
                sizes="(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 33vw"
                onerror="this.onerror=null; try{ this.closest('.thumb-link').replaceWith(Object.assign(document.createElement('div'),{className:'thumb'})); }catch{}" />
         </a>`
      : `<div class="thumb" aria-hidden="true"></div>`}
    <div class="card-body">
      <h3 class="title"><a class="title-link" href="${esc(postHref)}" data-id="${post.id}">${titleHTML}</a></h3>
      <div class="meta-author-date"><strong class="author">${esc(author)}</strong><span class="date">${date}</span></div>
      <p class="excerpt">${esc(excerpt)}</p>
    </div>`;
  return card;
}

function appendCardsInBatches(container, posts){
  let i = 0;
  function step(){
    const frag = document.createDocumentFragment();
    for (let n=0; n<BATCH_SIZE && i<posts.length; n++, i++){
      const p = posts[i];
      if (!p) continue;
      frag.appendChild(buildCardElement(p));
    }
    container.appendChild(frag);

    const MAX_DOM_CARDS = 220;
    if (container.children.length > MAX_DOM_CARDS) {
      const toRemove = container.children.length - MAX_DOM_CARDS;
      for (let k = 0; k < toRemove; k++) {
        container.removeChild(container.firstElementChild);
      }
    }

    if (i < posts.length) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderGridFromPosts(posts, append=false){
  const grid = getGrid(); if(!grid) return;
  if(!append) grid.innerHTML="";
  appendCardsInBatches(grid, posts || []);
  getLoader();
  const s = getSentinel();
  if (state._io && typeof state._io.observe === 'function'){
    if (state._sentinel && state._sentinel !== s){ try{ state._io.unobserve(state._sentinel);}catch{} }
    state._io.observe(s); state._sentinel = s;
  } else {
    state._io=null; state._sentinel=null; ensureInfiniteScroll();
  }
}

export async function loadNextPage(controllers){
  if (!isHomeRoute()) return;
  if (!state.firstPageShown) return;
  const now = performance.now();
  if (!(state.hasUserScrolled || (state.allowNextPageAfterTs && now >= state.allowNextPageAfterTs))) return;
  if (state.isLoading) return;
  if (state._loadingTicket) return;
  if (Number.isFinite(state.totalPages) && state.page >= state.totalPages) return;

  if (controllers.listAbort){ try{ controllers.listAbort.abort(); }catch{} }
  controllers.listAbort = new AbortController();

  state.isLoading=true; state._loadingTicket=true; saveHomeCache(); showLoader();
  try{
    const next=(state.page||1)+1;
    const { posts:newPosts, totalPages } = await fetchLeanPostsPage(next, controllers.listAbort.signal);
    state.posts=(state.posts||[]).concat(newPosts || []);
    state.page=next;
    if (Number.isFinite(totalPages)) state.totalPages = totalPages;
    else if (Array.isArray(newPosts) && newPosts.length < 12) state.totalPages = state.page;

    state.allowNextPageAfterTs = performance.now() + 500;

    saveHomeCache(); renderGridFromPosts(newPosts, true);
  }catch(err){ if(err?.name!=='AbortError') showError(err); }
  finally{ hideLoader(); state.isLoading=false; state._loadingTicket=false; saveHomeCache(); }
}

export function ensureInfiniteScroll(controllers){
  const sentinel = document.getElementById("scrollSentinel") || getSentinel();
  if (state._io && typeof state._io.observe === 'function'){
    if (state._sentinel && state._sentinel !== sentinel){ try{ state._io.unobserve(state._sentinel);}catch{} }
    state._io.observe(sentinel); state._sentinel = sentinel; return;
  }
  if (!state._io){
    state._io=new IntersectionObserver((entries)=>{
      const e=entries[0];
      if(!e||!e.isIntersecting) return;
      if (!isHomeRoute()) return;
      loadNextPage(controllers);
    }, { root:null, rootMargin:"800px 0px", threshold:0 });
  }
  state._io.observe(sentinel);
  state._sentinel = sentinel; state._ioAttached = true;
}

export async function renderHome(controllers){
  if (!app()) return;

  if (!state.returningFromDetail) {
    state.posts = [];
    state.page = 1;
    state.totalPages = null;
    state.firstPageShown = false;
    state.allowNextPageAfterTs = 0;
    state.hasUserScrolled = false;
    saveHomeCache();
  }

  if (state.returningFromDetail && Array.isArray(state.posts) && state.posts.length){
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
    ensureInfiniteScroll(controllers);

    (async ()=>{
      try{
        const grid=document.getElementById("grid");
        await nextFrame();
        if (targetY > 0) window.scrollTo(0, targetY);
        else if (wantAnchor){ const el=document.querySelector(`[data-id="${state.scrollAnchorPostId}"]`); (el?.closest(".card")||el)?.scrollIntoView({block:"start"}); }
        await whenImagesSettled(grid,900);
        await nextFrame();
        if (targetY > 0) window.scrollTo(0, targetY);
        else if (wantAnchor){ const el2=document.querySelector(`[data-id="${state.scrollAnchorPostId}"]`); (el2?.closest(".card")||el2)?.scrollIntoView({block:"start"}); }
      } finally {
        app().style.minHeight = "";
        document.documentElement.style.removeProperty("overflow-anchor");
        document.documentElement.style.scrollBehavior = prevScrollBehavior || "";
        state.returningFromDetail=false; saveHomeCache();
      }
    })();
    return;
  }

  app().innerHTML = `<p class="center">Loading…</p>`;
  if (controllers.listAbort){ try{ controllers.listAbort.abort(); }catch{} }
  controllers.listAbort = new AbortController();

  try{
    const { posts, totalPages } = await fetchLeanPostsPage(1, controllers.listAbort.signal);

    if (Array.isArray(posts) && posts[0]?.date) {
      console.info("[OkObserver] Home page1 newest (post-render check):", posts[0].date);
    }

    if (!Array.isArray(posts) || !posts.length){
      app().innerHTML=""; showError("No posts returned from the server.");
      return;
    }

    app().innerHTML="";
    renderGridFromPosts(posts,false);

    state.firstPageShown = true;
    state.allowNextPageAfterTs = performance.now() + 1200;
    state.hasUserScrolled = false;

    setTimeout(() => { ensureInfiniteScroll(controllers); }, 500);

    state.posts = posts.slice();
    state.page = 1;
    state.totalPages = Number.isFinite(totalPages) ? totalPages : null;
    state.scrollY = 0; state.homeScrollY=0; state.scrollAnchorPostId=null; state.isLoading=false;
    saveHomeCache();
  } catch(err){
    if (err?.name !== 'AbortError'){
      console.error("[OkObserver] Home load failed:", err, err?.details || "");
      showError(err?.message || err);
      if (err?.details) showError(err.details);
    }
    app().innerHTML="";
  }
}

// navigation from cards
document.addEventListener('click', (e)=>{
  const link = e.target.closest('a.thumb-link, a.title-link');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  if (href.startsWith('#/post/')) {
    e.preventDefault();
    state.scrollY = window.scrollY || window.pageYOffset || 0;
    state.homeScrollY = state.scrollY;
    const id = Number(link.dataset.id || '') || null;
    if (id !== null) state.scrollAnchorPostId = id;
    state.returningFromDetail = true;
    try{ sessionStorage.setItem('__okCache', JSON.stringify(stateForSave(state))); }catch{}
    const old = location.hash;
    location.hash = href;
    if (old === href) window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
});

// unlock next-page after small scroll
window.addEventListener('scroll', function () {
  if (!isHomeRoute()) return;
  const y = window.scrollY || window.pageYOffset || 0;
  state.scrollY = y;
  if (!state.hasUserScrolled && y > 50) {
    state.hasUserScrolled = true;
  }
}, { passive: true });

// Fallback infinite scroll
export function attachScrollFallback(controllers){
  window.addEventListener('scroll', function () {
    if (!isHomeRoute()) return;
    if (state.isLoading) return;

    const now = performance.now();
    if (!state.firstPageShown) return;
    if (!(state.hasUserScrolled || (state.allowNextPageAfterTs && now >= state.allowNextPageAfterTs))) return;

    const nearBottom = (window.innerHeight + (window.scrollY || window.pageYOffset || 0)) >= (document.body.scrollHeight - 800);
    if (nearBottom) {
      if (!state._io || typeof state._io.observe !== 'function') ensureInfiniteScroll(controllers);
      loadNextPage(controllers);
    }
  }, { passive: true });
}
