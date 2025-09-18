// app.js — OkObserver v1.56.6 (stable minimal build)
const APP_VERSION = "v1.57.2";
window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT = "cartoon";
  const app = document.getElementById("app");
  // ---- Home view cache (posts + scroll) ----
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}
  window.__okCache = window.__okCache || {
    posts: [],
    page: 1,
    totalPages: 1,
    scrollY: 0,
    scrollAnchorPostId: null,
    returningFromDetail: false
  };
  function saveHomeCache(){
    try{ sessionStorage.setItem("__okCache", JSON.stringify(window.__okCache)); }catch{}
  }
  (function rehydrate(){
    try{
      const raw=sessionStorage.getItem("__okCache");
      if(raw){
        const val=JSON.parse(raw);
        if(val && typeof val==="object") window.__okCache={...window.__okCache,...val};
      }
    }catch{}
  })();


  function showError(message){
    const msg=(message&&message.message)?message.message:String(message||"Something went wrong.");
    const div=document.createElement("div");
    div.className="error-banner";
    div.innerHTML=`<button class="close" aria-label="Dismiss">×</button>${msg}`;
    (app || document.body).prepend(div);
  }
  document.addEventListener("click",(e)=>{
    const btn=e.target.closest(".error-banner .close");
    if(btn) btn.closest(".error-banner")?.remove();
  });

  const esc=(s)=>(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const getAuthor=(p)=>p?._embedded?.author?.[0]?.name||"";
  function hasExcluded(p){
    const groups=p?._embedded?.["wp:term"]||[];
    const cats=groups.flat().filter(t=>(t?.taxonomy||"").toLowerCase()==="category");
    const norm=(x)=>(x||"").trim().toLowerCase();
    return cats.some(c=>norm(c.slug)===EXCLUDE_CAT || norm(c.name)===EXCLUDE_CAT);
  }
  function ordinalDate(iso){
    const d=new Date(iso);
    const day=d.getDate();
    const suf=(n)=>(n>3&&n<21)?"th":(["th","st","nd","rd"][Math.min(n%10,4)]||"th");
    return `${d.toLocaleString("en-US",{month:"long"})} ${day}${suf(day)}, ${d.getFullYear()}`;
  }
  function firstImgFromHTML(html){
    const div=document.createElement("div");
    div.innerHTML=html||"";
    const img=div.querySelector("img");
    if(!img) return "";
    const ss=img.getAttribute("srcset");
    if(ss){
      const last=ss.split(",").map(s=>s.trim()).pop();
      const url=last?.split(" ")?.[0];
      if(url) return url;
    }
    return img.getAttribute("data-src")||img.getAttribute("src")||"";
  }
  function featuredSrcsetAndSize(p){
    const m=p?._embedded?.["wp:featuredmedia"]?.[0];
    if(!m) return { src:"", srcset:"", width:null, height:null };
    const sizes=m.media_details?.sizes||{};
    const order=["2048x2048","1536x1536","large","medium_large","medium","thumbnail"];
    const list=[];
    for(const k of order){
      const s=sizes[k];
      if(s?.source_url && s?.width) list.push(`${s.source_url} ${s.width}w`);
    }
    const best = sizes["2048x2048"] || sizes["1536x1536"] || sizes.large || sizes.medium_large || sizes.medium || null;
    return {
      src: (best?.source_url || m.source_url || ""),
      srcset: list.join(", "),
      width: (best?.width || m.media_details?.width || null),
      height:(best?.height|| m.media_details?.height|| null)
    };
  }
  function hardenLinks(root){
    if(!root) return;
    root.querySelectorAll("a[href]").forEach(a=>{
      const href=a.getAttribute("href")||"";
      const isInternal=href.startsWith("#/");
      if(isInternal){ a.removeAttribute("target"); a.removeAttribute("rel"); return; }
      if(/^https?:\/\//i.test(href)){ a.target="_blank"; a.rel="noopener"; }
    });
  }
  function deLazyImages(root){
    if(!root) return;
    root.querySelectorAll("img").forEach(img=>{
      const realSrc=img.getAttribute("data-src")||img.getAttribute("data-lazy-src")||img.getAttribute("data-original")||"";
      const realSrcset=img.getAttribute("data-srcset")||img.getAttribute("data-lazy-srcset")||"";
      if(realSrc) img.setAttribute("src",realSrc);
      if(realSrcset) img.setAttribute("srcset",realSrcset);
      img.classList.remove("lazyload","lazy","jetpack-lazy-image");
      img.loading="lazy"; img.decoding="async";
      if(!img.style.maxWidth) img.style.maxWidth="100%";
      if(!img.style.height) img.style.height="auto";
    });
  }
  function transformEmbeds(root){
    if(!root) return;
    const hasPlayable = (node) => !!node.querySelector("iframe, video");
    root.querySelectorAll(".wp-block-embed__wrapper, .wp-block-embed").forEach(box=>{
      if(hasPlayable(box)) return;
      const a = box.querySelector('a[href*="youtube.com/"], a[href*="youtu.be/"], a[href*="vimeo.com/"], a[href*="facebook.com/"]');
      const href = a?.getAttribute("href") || "";
      if(href){
        const provider = href.includes("vimeo.com") ? "Vimeo" : (href.includes("youtube")||href.includes("youtu.be")) ? "YouTube":"Facebook";
        const fallback = document.createElement("div");
        fallback.className="video-fallback";
        fallback.innerHTML = `<div>Video can’t be embedded here.</div><a class="btn" href="${href}" target="_blank" rel="noopener">Watch on ${provider}</a>`;
        box.replaceWith(fallback);
      } else if(!box.textContent.trim()) box.remove();
    });
  }
  function normalizeContent(html){
    const root=document.createElement("div");
    root.innerHTML=html||"";
    root.querySelectorAll("figure.wp-block-embed,.wp-block-embed__wrapper").forEach(c=>{
      if(!c.querySelector("iframe,a,img,video") && !c.textContent.trim()) c.remove();
    });
    deLazyImages(root);
    transformEmbeds(root);
    return root.innerHTML;
  }
  function normalizeFirstParagraph(root){
    if(!root) return;
    const blocks = root.querySelectorAll("p, div, section, article, blockquote");
    let firstBlock = null;
    for (const el of blocks) {
      const txt = (el.textContent || "").replace(/\u00A0/g, " ").trim();
      if (txt.length > 0) { firstBlock = el; break; }
    }
    if (!firstBlock) return;
    firstBlock.style.setProperty("text-align","left","important");
    firstBlock.style.setProperty("text-indent","0","important");
    firstBlock.style.setProperty("margin-left","0","important");
    firstBlock.style.setProperty("padding-left","0","important");
  }

  // Highlight paywall/login notice in brand color
  function highlightAccessNotice(root){
    if(!root) return;
    const needle = "to access this content, you must log in or purchase";
    const els = root.querySelectorAll("p, div, section, article, blockquote");
    els.forEach(el=>{
      const txt = (el.textContent||"").replace(/\s+/g," ").trim().toLowerCase();
      if (txt.includes(needle)) {
        el.style.color = "#1E90FF";
        el.style.fontWeight = "normal";
      }
    });
  }

  // ---------- UI builders ----------
  function buildCardElement(post) {
    const card = document.createElement("div");
    card.className = "card";

    const fm = featuredSrcsetAndSize(post);
    const fallback = firstImgFromHTML(post.content?.rendered || "");
    const imgSrc = fm.src || fallback || "";
    const author = getAuthor(post);
    const date = ordinalDate(post.date);
    const excerpt = post.excerpt?.rendered.replace(/<[^>]+>/g, '') || '';
    const postHref = `#/post/${post.id}`;
    const titleHTML = post.title.rendered;

    card.innerHTML = `
      ${imgSrc
        ? `<a class="thumb-link" href="${esc(postHref)}" data-id="${post.id}" aria-label="Open post">
             <img src="${esc(imgSrc)}" alt="${esc(titleHTML)}" class="thumb" loading="lazy" decoding="async" />
           </a>`
        : `<div class="thumb" aria-hidden="true"></div>`}
      <div class="card-body">
        <h3 class="title">
          <a class="title-link" href="${esc(postHref)}" data-id="${post.id}">${titleHTML}</a>
        </h3>
        <div class="meta-author-date">
          <strong class="author">${esc(author)}</strong>
          <span class="date">${date}</span>
        </div>
        <p class="excerpt">${excerpt}</p>
      </div>
    `;
    return card;
  }

  
const LOAD_THRESHOLD = 800; // px from bottom to trigger
function getGrid(){
  let grid = document.getElementById("grid");
  if(!grid){
    grid = document.createElement("div");
    grid.id = "grid";
    grid.className = "grid";
    app.appendChild(grid);
  }
  return grid;
}
function renderGridFromPosts(posts, append=false){
  const grid = getGrid();
  if(!append) grid.innerHTML = "";
  (posts||[]).forEach(p => { if (p && !hasExcluded(p)) grid.appendChild(buildCardElement(p)); });
}
function getLoader(){
  let ld = document.getElementById("infiniteLoader");
  if(!ld){
    ld = document.createElement("div");
    ld.id = "infiniteLoader";
    ld.className = "infinite-loader";
    ld.innerHTML = '<span class="spinner" aria-hidden="true"></span> Loading…';
    app.appendChild(ld);
  }
  return ld;
}
function showLoader(){ const ld=getLoader(); ld.style.display="flex"; }
function hideLoader(){ const ld=document.getElementById("infiniteLoader"); if(ld) ld.style.display="none"; }

async function loadNextPage(){
  const st = window.__okCache || (window.__okCache = {});
  if (st.isLoading) return;
  if (st.page >= st.totalPages) return;
  st.isLoading = true; saveHomeCache();
  showLoader();
  try {
    const next = st.page + 1;
    const url = `${BASE}/posts?per_page=${PER_PAGE}&page=${next}&_embed=1`;
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    const newPosts = await res.json();
    // Filter out excluded and duplicates by id
    const existingIds = new Set((st.posts||[]).map(p=>p?.id));
    const add = [];
    for (const p of newPosts) {
      if (!p || existingIds.has(p.id) || hasExcluded(p)) continue;
      add.push(p);
      existingIds.add(p.id);
    }
    st.posts = (st.posts || []).concat(add);
    st.page = next;
    const tp = Number(res.headers.get("X-WP-TotalPages") || st.totalPages || 1);
    st.totalPages = tp;
    saveHomeCache();
    renderGridFromPosts(add, true);
  } catch (err) {
    showError(err);
  } finally {
    hideLoader();
    const st2 = window.__okCache || {};
    st2.isLoading = false;
    saveHomeCache();
  }
}

function ensureInfiniteScroll(){
  const st = window.__okCache || (window.__okCache = {});
  if (st._infAttached) return;
  st._infAttached = true;
  window.addEventListener("scroll", () => {
    // keep scrollY fresh
    st.scrollY = window.scrollY || window.pageYOffset || 0;
    // near bottom?
    const bottom = (window.innerHeight + (window.scrollY || window.pageYOffset || 0)) >= (document.body.scrollHeight - LOAD_THRESHOLD);
    if (bottom) loadNextPage();
  }, { passive: true });
}

async function renderHome() {
  if (!app) return;
  const st = window.__okCache || (window.__okCache = {});

  // Returning from detail with cache: render fast & restore scroll
  if (st.returningFromDetail && Array.isArray(st.posts) && st.posts.length) {
    app.innerHTML = "";
    renderGridFromPosts(st.posts, false);
    getLoader(); // ensure loader node exists
    ensureInfiniteScroll();

    requestAnimationFrame(()=>{
      setTimeout(()=>{
        if (typeof st.scrollY === "number" && st.scrollY > 0) {
          window.scrollTo({ top: st.scrollY });
        } else if (st.scrollAnchorPostId) {
          const a = document.querySelector(`[data-id="${st.scrollAnchorPostId}"]`);
          a?.scrollIntoView({ block: "start" });
        }
      }, 0);
    });

    st.returningFromDetail = false;
    saveHomeCache();
    return;
  }

  // Fresh load
  app.innerHTML = `<p class="center">Loading…</p>`;
  try {
    const url = `${BASE}/posts?per_page=${PER_PAGE}&page=1&_embed=1`;
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    const posts = await res.json();

    app.innerHTML = "";
    renderGridFromPosts(posts, false);
    getLoader();
    ensureInfiniteScroll();

    // Cache base state
    st.posts = posts.filter(p => p && !hasExcluded(p));
    st.page = 1;
    st.totalPages = Number(res.headers.get("X-WP-TotalPages") || 1);
    st.scrollY = 0;
    st.scrollAnchorPostId = null;
    st.isLoading = false;
    saveHomeCache();
  } catch (err) {
    showError(err);
    app.innerHTML = "";
  }
}

        }, 0);
      });

      st.returningFromDetail = false;
      saveHomeCache();
      return;
    }

    // Fresh load
    app.innerHTML = `<p class="center">Loading…</p>`;
    try {
      const url = `${BASE}/posts?per_page=${PER_PAGE}&page=1&_embed=1`;
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
      const posts = await res.json();

      // Cache the home list
      st.posts = posts;
      st.page = 1;
      st.totalPages = Number(res.headers.get("X-WP-TotalPages") || 1);
      saveHomeCache();

      app.innerHTML = "";
      const grid = document.createElement("div");
      grid.className = "grid";
      posts.forEach(post => { if (!hasExcluded(post)) grid.appendChild(buildCardElement(post)); });
      app.appendChild(grid);
    } catch (err) {
      showError(err);
      app.innerHTML = "";
    }
  }

  function renderPostShell(){
    if (!app) return;
    app.innerHTML = `
      <article class="post" id="postView">
        <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:10px">
          <a class="btn" id="backTop" href="#/">Back to posts</a>
        </div>
        <h1 id="pTitle"></h1>
        <div class="meta-author-date">
          <span class="author" id="pAuthor" style="font-weight:bold"></span>
          <span style="margin:0 6px">·</span>
          <span class="date" id="pDate" style="font-weight:normal;color:#000"></span>
        </div>
        <img id="pHero" class="hero" alt="" style="object-fit:contain;max-height:420px;display:none" />
        <div class="content" id="pContent"></div>
        <div style="display:flex;justify-content:space-between;gap:10px;margin-top:16px">
          <a class="btn" id="backBottom" href="#/">Back to posts</a>
        </div>
      </article>
    `;
    const goHome = (e)=>{ e?.preventDefault?.(); location.hash = "#/"; };
    document.getElementById("backTop")?.addEventListener("click", goHome);
    document.getElementById("backBottom")?.addEventListener("click", goHome);
  }

  async function renderPost(id) {
    renderPostShell();
    const url = `${BASE}/posts/${id}?_embed=1`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Post not found');
      const post = await res.json();
      const { src, width, height } = featuredSrcsetAndSize(post);
      const author = getAuthor(post);
      const date = ordinalDate(post.date);

      const pTitle = document.getElementById('pTitle');
      const pAuthor = document.getElementById('pAuthor');
      const pDate = document.getElementById('pDate');
      const pHero = document.getElementById('pHero');
      const pContent = document.getElementById('pContent');

      if (pTitle) pTitle.innerHTML = post.title.rendered;
      if (pAuthor) pAuthor.textContent = author || '';
      if (pDate) pDate.textContent = date || '';

      if (pHero && src) {
        pHero.src = src;
        if (width) pHero.width = width;
        if (height) pHero.height = height;
        pHero.style.display = '';
        pHero.alt = pTitle?.textContent || '';
        pHero.loading = 'lazy';
        pHero.decoding = 'async';
      }

      if (pContent) {
        pContent.innerHTML = normalizeContent(post.content.rendered);
        normalizeFirstParagraph(pContent);
        highlightAccessNotice(pContent);
        hardenLinks(pContent);
      }
    } catch (err) {
      showError(err);
    }
  }

  // ---------- Router ----------
  function router() {
    const hash = window.location.hash || "#/";
    const m = hash.match(/^#\/post\/(\d+)(?:[\/\?].*)?$/);
    if (m && m[1]) renderPost(m[1]);
    else renderHome();
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("DOMContentLoaded", router);
  if (document.readyState === "interactive" || document.readyState === "complete") { router(); }

  // Robust delegation for clicks on cards (image/title)
  document.addEventListener('click', (e)=>{
    const link = e.target.closest('a.thumb-link, a.title-link');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#/post/')) {
      e.preventDefault();
      const st = window.__okCache || (window.__okCache = {});
      // Remember current scroll position and which post you tapped
      st.scrollY = window.scrollY || window.pageYOffset || 0;
      const id = Number(link.dataset.id || '') || null;
      if (id !== null) st.scrollAnchorPostId = id;
      st.returningFromDetail = true;
      saveHomeCache();
      // Navigate
      const old = location.hash;
      location.hash = href;
      if (old === href) router();
    }
  });
})();

// track scroll so home position stays fresh
window.addEventListener('scroll', function () {
  const st = window.__okCache || (window.__okCache = {});
  st.scrollY = window.scrollY || window.pageYOffset || 0;
}, { passive: true });
