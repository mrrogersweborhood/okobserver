// app.js — OkObserver v1.59.3
// - Smooth return-from-detail scroll restore (freeze height, disable anchoring, double restore)
// - Pause infinite scroll during restore
// - Prior fixes: AbortError handling, IO persistence guard, perf tweaks
const APP_VERSION = "v1.59.3";
window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT = "cartoon";
  const app = document.getElementById("app");

  // Abort controllers to cancel stale network work
  let listAbort;    // for home list & pagination
  let detailAbort;  // for post detail

  // ---- session cache (posts + paging + scroll) ----
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}
  window.__okCache = window.__okCache || {
    posts: [],
    page: 1,
    totalPages: null,
    scrollY: 0,
    homeScrollY: 0,
    scrollAnchorPostId: null,
    returningFromDetail: false,
    isLoading: false,
    _ioAttached: false,
    _io: null,
    _sentinel: null
  };

  // omit transient fields when saving
  function stateForSave(st){
    const { _io, _sentinel, isLoading, ...rest } = st || {};
    return rest;
  }
  function saveHomeCache(){
    try{ sessionStorage.setItem("__okCache", JSON.stringify(stateForSave(window.__okCache))); }catch{}
  }
  (function rehydrate(){
    try{
      const raw=sessionStorage.getItem("__okCache");
      if(raw){
        const val=JSON.parse(raw);
        if(val && typeof val==="object"){
          window.__okCache={...window.__okCache,...val};
        }
      }
    }catch{}
    // Never trust persisted IO handles
    window.__okCache._io = null;
    window.__okCache._sentinel = null;
    window.__okCache.isLoading = false;
  })();

  // ---- utils ----
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

  const esc=(s)=>(s||"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
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

  // Wait until images under `root` are loaded (or a short timeout) before restoring scroll
  function whenImagesSettled(root, timeout = 2000) {
    return new Promise((resolve) => {
      const imgs = Array.from((root || document).querySelectorAll('img'));
      if (!imgs.length) return resolve();
      let settled = false, seen = 0;
      const check = () => {
        if (settled) return;
        seen += 1;
        if (seen >= imgs.length) { settled = true; resolve(); }
      };
      imgs.forEach((img) => {
        if (img.complete) check();
        else {
          img.addEventListener('load', check, { once: true });
          img.addEventListener('error', check, { once: true });
        }
      });
      setTimeout(() => { if (!settled) resolve(); }, timeout);
    });
  }

  // Frame helpers & restore guard
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  let __isRestoring = false;

  // Decode HTML entities so &hellip; -> … and &#8211; -> –
  const __decoder = document.createElement('textarea');
  function decodeEntities(str) {
    __decoder.innerHTML = str || "";
    return __decoder.value;
  }

  function firstImgFromHTML(html){
    const div=document.createElement("div"); div.innerHTML=html||"";
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
    const order = ["2048x2048","1536x1536","large","medium_large","medium","thumbnail"];
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

  // Strong first-paragraph normalizer
  function normalizeFirstParagraph(root){
    if (!root) return;

    // Find first meaningful text node
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node){
          const t = (node.nodeValue || "").replace(/\u00A0/g, " ").trim();
          return t ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );
    const firstText = walker.nextNode();
    if (!firstText) return;

    // Climb to its paragraph; fallback to first <p>
    let el = firstText.parentElement;
    while (el && el !== root && el.tagName !== "P") el = el.parentElement;
    if (!el || el === root) el = root.querySelector("p");
    if (!el) return;

    // Strip leading NBSP/nbsp/spaces used to fake indents
    el.innerHTML = el.innerHTML.replace(/^(\u00A0|&nbsp;|\s)+/i, "");

    // Zero out indent/padding/margin and enforce left align
    const zeroOut = (node) => {
      node.style.setProperty("text-indent","0","important");
      node.style.setProperty("margin-left","0","important");
      node.style.setProperty("padding-left","0","important");
      node.style.setProperty("text-align","left","important");
    };
    zeroOut(el);

    // Also neutralize common block ancestors that might push it
    let parent = el.parentElement;
    while (parent && parent !== root && !parent.classList.contains("content")) {
      const tag = (parent.tagName || "").toLowerCase();
      if (["div","section","article","blockquote","figure"].includes(tag)) zeroOut(parent);
      parent = parent.parentElement;
    }
  }

  function normalizeContent(html){
    const root=document.createElement("div"); root.innerHTML=html||"";
    root.querySelectorAll("figure.wp-block-embed,.wp-block-embed__wrapper").forEach(c=>{
      if(!c.querySelector("iframe,a,img,video") && !c.textContent.trim()) c.remove();
    });
    deLazyImages(root);
    transformEmbeds(root);
    return root.innerHTML;
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

  // ---- routing helpers ----
  function isHomeRoute(){
    const h = window.location.hash || "#/";
    return h === "#/" || h === "#";
  }

  // ---- UI builders ----
  function buildCardElement(post) {
    const card = document.createElement("div");
    card.className = "card";

    // Try featured media first, otherwise the first <img> from content
    const fm = featuredSrcsetAndSize(post);
    const fallback = firstImgFromHTML(post?.content?.rendered || "");
    const imgSrc = fm.src || fallback || "";

    // Author may be missing if _embed was blocked
    const author = getAuthor(post) || "";

    const date = ordinalDate(post.date);
    const excerpt = decodeEntities(
      (post?.excerpt?.rendered || "")
        .replace(/<[^>]+>/g, "")
        .trim()
    );
    const postHref = `#/post/${post.id}`;
    const titleHTML = (post?.title?.rendered || "Untitled");

    const sizes = '(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 33vw';

    card.innerHTML = `
      ${imgSrc
        ? `<a class="thumb-link" href="${esc(postHref)}" data-id="${post.id}" aria-label="Open post">
             <img src="${esc(imgSrc)}"
                  alt="${esc(titleHTML)}"
                  class="thumb"
                  loading="lazy"
                  decoding="async"
                  fetchpriority="low"
                  sizes="${esc(sizes)}" />
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
        <p class="excerpt">${esc(excerpt)}</p>
      </div>
    `;
    return card;
  }

  // ---- Home grid, loader, sentinel ----
  function getGrid(){
    if (!isHomeRoute()) return null;
    let grid = document.getElementById("grid");
    if(!grid){
      grid = document.createElement("div");
      grid.id = "grid";
      grid.className = "grid";
      app.appendChild(grid);
    }
    return grid;
  }
  function getLoader(){
    let ld = document.getElementById("infiniteLoader");
    if(!ld){
      ld = document.createElement("div");
      ld.id = "infiniteLoader";
      ld.className = "infinite-loader";
      ld.innerHTML = '<span class="spinner" aria-hidden="true"></span> Loading…';
      ld.style.display = "none";
      app.appendChild(ld);
    }
    return ld;
  }
  function showLoader(){ const ld=getLoader(); ld.style.display="flex"; }
  function hideLoader(){ const ld=document.getElementById("infiniteLoader"); if(ld) ld.style.display="none"; }

  function getSentinel(){
    let s = document.getElementById("scrollSentinel");
    if(!s){
      s = document.createElement("div");
      s.id = "scrollSentinel";
      s.style.cssText = "height:1px;width:100%;";
      app.appendChild(s);
    } else {
      app.appendChild(s); // ensure bottom
    }
    return s;
  }

  function renderGridFromPosts(posts, append=false){
    const grid = getGrid();
    if(!grid) return;
    if(!append) grid.innerHTML = "";

    // Batch DOM inserts
    const frag = document.createDocumentFragment();
    (posts||[]).forEach(p => { if (p && !hasExcluded(p)) frag.appendChild(buildCardElement(p)); });
    grid.appendChild(frag);

    // keep loader and sentinel at the bottom
    getLoader();
    const s = getSentinel();

    const st = window.__okCache || (window.__okCache = {});
    // If IO exists & valid, re-observe; else (re)create
    if (st._io && typeof st._io.observe === 'function') {
      if (st._sentinel && st._sentinel !== s) {
        try { st._io.unobserve(st._sentinel); } catch {}
      }
      st._io.observe(s);
      st._sentinel = s;
    } else {
      st._io = null;
      st._sentinel = null;
      ensureInfiniteScroll(); // will create fresh IO and observe
    }
  }

  async function loadNextPage(){
    if (!isHomeRoute()) return;
    if (__isRestoring) return; // don't page during restore
    const st = window.__okCache || (window.__okCache = {});
    if (st.isLoading) return;
    if (Number.isFinite(st.totalPages) && st.page >= st.totalPages) return;

    // reuse/refresh listAbort
    if (listAbort) { try{ listAbort.abort(); }catch{} }
    listAbort = new AbortController();

    st.isLoading = true; saveHomeCache();
    showLoader();
    try {
      const next = (st.page||1) + 1;
      const url = `${BASE}/posts?per_page=${PER_PAGE}&page=${next}&_embed=1`;
      const res = await fetch(url, {
        credentials: "omit",
        headers: { "Accept": "application/json" },
        signal: listAbort.signal
      });
      if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
      const newPosts = await res.json();
      const existingIds = new Set((st.posts||[]).map(p=>p?.id));
      const add = [];
      for (const p of newPosts) {
        if (!p || existingIds.has(p.id) || hasExcluded(p)) continue;
        add.push(p);
        existingIds.add(p.id);
      }
      st.posts = (st.posts || []).concat(add);
      st.page = next;

      const tp = Number(res.headers.get("X-WP-TotalPages"));
      if (Number.isFinite(tp) && tp > 0) st.totalPages = tp;
      else if (Array.isArray(newPosts) && newPosts.length < PER_PAGE) st.totalPages = st.page;

      saveHomeCache();
      renderGridFromPosts(add, true);
    } catch (err) {
      if (err?.name !== 'AbortError') showError(err);
    } finally {
      hideLoader();
      const st2 = window.__okCache || {};
      st2.isLoading = false;
      saveHomeCache();
    }
  }

  // IntersectionObserver-based infinite scroll (resilient across DOM swaps)
  function ensureInfiniteScroll(){
    const st = window.__okCache || (window.__okCache = {});
    const sentinel = getSentinel();

    // If we have a valid IO, ensure it watches the current sentinel
    if (st._io && typeof st._io.observe === 'function') {
      if (st._sentinel && st._sentinel !== sentinel) {
        try { st._io.unobserve(st._sentinel); } catch {}
      }
      st._io.observe(sentinel);
      st._sentinel = sentinel;
      return;
    }

    // Create fresh observer
    const io = new IntersectionObserver((entries)=>{
      const e = entries[0];
      if (!e || !e.isIntersecting) return;
      if (!isHomeRoute()) return;
      if (__isRestoring) return; // guard during restore
      loadNextPage();
    }, {
      root: null,
      rootMargin: "1000px 0px",
      threshold: 0
    });

    io.observe(sentinel);
    st._io = io;
    st._sentinel = sentinel;
    st._ioAttached = true;
  }

  // ---- Views ----
  async function renderHome() {
    if (!app) return;
    const st = window.__okCache || (window.__okCache = {});

    // Returning from detail: fast render from cache + smooth scroll restore
    if (st.returningFromDetail && Array.isArray(st.posts) && st.posts.length) {
      __isRestoring = true;

      // Snapshot target
      const targetY = (typeof st.homeScrollY === "number" ? st.homeScrollY : st.scrollY) || 0;
      const wantAnchor = !targetY && st.scrollAnchorPostId;

      // Freeze height & disable anchoring so DOM swaps don’t yank the page
      const rootEl = document.documentElement;
      const body = document.body;
      const prevHeight = Math.max(body.scrollHeight, rootEl.scrollHeight);
      const prevScrollBehavior = rootEl.style.scrollBehavior;
      app.style.minHeight = prevHeight + "px";
      rootEl.style.scrollBehavior = "auto";
      rootEl.style.setProperty("overflow-anchor", "none");

      // Rebuild grid from cache
      app.innerHTML = "";
      renderGridFromPosts(st.posts, false);
      ensureInfiniteScroll();

      const doRestore = async () => {
        const grid = document.getElementById("grid");
        // Let layout settle after re-render
        await nextFrame();

        // First position set immediately (before images load)
        if (targetY > 0) {
          window.scrollTo(0, targetY);
        } else if (wantAnchor) {
          const el = document.querySelector(`[data-id="${st.scrollAnchorPostId}"]`);
          (el?.closest(".card") || el)?.scrollIntoView({ block: "start" });
        }

        // Wait for images then correct drift once more
        await whenImagesSettled(grid, 2000);
        await nextFrame();

        if (targetY > 0) {
          window.scrollTo(0, targetY);
        } else if (wantAnchor) {
          const el2 = document.querySelector(`[data-id="${st.scrollAnchorPostId}"]`);
          (el2?.closest(".card") || el2)?.scrollIntoView({ block: "start" });
        }

        // Unfreeze
        app.style.minHeight = "";
        rootEl.style.removeProperty("overflow-anchor");
        rootEl.style.scrollBehavior = prevScrollBehavior || "";

        // Clear the flag after we restore once
        st.returningFromDetail = false;
        __isRestoring = false;
        saveHomeCache();
      };

      // Fire and forget
      doRestore();
      return;
    }

    // Fresh load with rich error reporting + fallback
    app.innerHTML = `<p class="center">Loading…</p>`;

    // cancel any previous list fetch
    if (listAbort) { try{ listAbort.abort(); }catch{} }
    listAbort = new AbortController();

    async function fetchPage(pageNum) {
      const url = `${BASE}/posts?per_page=${PER_PAGE}&page=${pageNum}&_embed=1`;
      const res = await fetch(url, {
        credentials: "omit",
        headers: { "Accept": "application/json" },
        signal: listAbort.signal
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`API Error ${res.status}${res.statusText ? `: ${res.statusText}` : ""}`);
        err.details = text?.slice(0, 300);
        throw err;
      }
      const data = await res.json();
      return { data, res };
    }

    try {
      // First attempt (full, embedded)
      let data, res;
      try {
        ({ data, res } = await fetchPage(1));
      } catch (e1) {
        // If we were aborted (route change), don't retry
        if (e1?.name === 'AbortError' || listAbort.signal.aborted) return;

        // Fallback: minimal fields, no _embed (some hosts throttle embedded)
        console.warn("[OkObserver] First attempt failed, retrying fallback:", e1);

        // Use a fresh controller for fallback to avoid "aborted signal"
        if (listAbort) { try{ listAbort.abort(); }catch{} }
        listAbort = new AbortController();

        const fallbackUrl = `${BASE}/posts?per_page=${PER_PAGE}&page=1&_fields=id,date,title,excerpt,content,link`;
        const res2 = await fetch(fallbackUrl, {
          credentials: "omit",
          headers: { "Accept": "application/json" },
          signal: listAbort.signal
        });
        if (!res2.ok) {
          const text = await res2.text().catch(() => "");
          const err = new Error(`API Error ${res2.status}${res2.statusText ? `: ${res2.statusText}` : ""}`);
          err.details = text?.slice(0, 300);
          throw err;
        }
        data = await res2.json();
        res = res2;
      }

      const posts = Array.isArray(data) ? data : [];
      if (posts.length === 0) {
        app.innerHTML = "";
        showError("No posts returned from the server. (Try again in a minute or check WP REST settings.)");
        renderGridFromPosts([], false);
        ensureInfiniteScroll();
        return;
      }

      app.innerHTML = "";
      renderGridFromPosts(posts, false);
      ensureInfiniteScroll();

      // Cache base state
      st.posts = posts.filter(p => p && !hasExcluded(p));
      st.page = 1;
      const tp = Number(res.headers?.get?.("X-WP-TotalPages"));
      st.totalPages = Number.isFinite(tp) && tp > 0 ? tp : null;
      st.scrollY = 0;
      st.homeScrollY = 0;
      st.scrollAnchorPostId = null;
      st.isLoading = false;
      saveHomeCache();
      console.info("[OkObserver] pages:", { page: st.page, totalPages: st.totalPages });
    } catch (err) {
      if (err?.name !== 'AbortError'){
        console.error("[OkObserver] Home load failed:", err, err?.details || "");
        showError((err && err.message) ? err.message : err);
        if (err?.details) showError(err.details);
      }
      app.innerHTML = "";
      renderGridFromPosts([], false);
    }
  }

  function renderPostShell(){
    try{ const ld=document.getElementById("infiniteLoader"); if(ld) ld.remove(); }catch{}
    if (!app) return;
    app.innerHTML = `
      <article class="post" id="postView">
        <!-- Top back button intentionally removed -->
        <h1 id="pTitle"></h1>
        <div class="meta-author-date">
          <span class="author" id="pAuthor" style="font-weight:bold"></span>
          <span style="margin:0 6px">·</span>
          <span class="date" id="pDate" style="font-weight:normal;color:#000"></span>
        </div>
        <img id="pHero" class="hero" alt="" style="object-fit:contain;max-height:420px;display:none" />
        <div class="content" id="pContent"></div>
        <div style="display:flex;justify-content:space-between;gap:10px;margin-top:16px">
          <a class="btn" id="backBottom" href="#/" style="display:none">Back to posts</a>
        </div>
      </article>
    `;
    const goHome = (e)=>{
      e?.preventDefault?.();
      const st = window.__okCache || (window.__okCache = {});
      st.returningFromDetail = true;
      try{ sessionStorage.setItem("__okCache", JSON.stringify(stateForSave(st))); }catch{}
      location.hash = "#/";
    };
    document.getElementById("backBottom")?.addEventListener("click", goHome);
  }

  async function renderPost(id) {
    renderPostShell();

    // cancel any previous detail fetch
    if (detailAbort) { try{ detailAbort.abort(); }catch{} }
    detailAbort = new AbortController();

    const url = `${BASE}/posts/${id}?_embed=1`;
    try {
      const res = await fetch(url, { headers: { "Accept": "application/json" }, signal: detailAbort.signal });
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

      if (pTitle) pTitle.innerHTML = post?.title?.rendered || "Untitled";
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
        pHero.fetchPriority = 'high';
        pHero.sizes = '100vw';
      }

      if (pContent) {
        pContent.innerHTML = normalizeContent(post?.content?.rendered || "");

        const idle = window.requestIdleCallback || function (cb){ return setTimeout(cb, 1); };
        idle(() => {
          try { normalizeFirstParagraph(pContent); } catch {}
          try { hardenLinks(pContent); } catch {}
        });
      }

      const backBtn = document.getElementById('backBottom');
      if (backBtn) backBtn.style.display = '';

    } catch (err) {
      if (err?.name !== 'AbortError') showError(err);
      const backBtn = document.getElementById('backBottom');
      if (backBtn) backBtn.style.display = '';
    }
  }

  // ---- Router ----
  function router() {
    const hash = window.location.hash || "#/";
    const m = hash.match(/^#\/post\/(\d+)(?:[\/\?].*)?$/);
    if (m && m[1]) renderPost(m[1]);
    else renderHome();
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("DOMContentLoaded", router);
  if (document.readyState === "interactive" || document.readyState === "complete") { router(); }

  // ---- Click delegation for card links ----
  document.addEventListener('click', (e)=>{
    const link = e.target.closest('a.thumb-link, a.title-link');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#/post/')) {
      e.preventDefault();
      const st = window.__okCache || (window.__okCache = {});
      // Save exact Home position before leaving
      st.scrollY = window.scrollY || window.pageYOffset || 0;
      st.homeScrollY = st.scrollY;
      const id = Number(link.dataset.id || '') || null;
      if (id !== null) st.scrollAnchorPostId = id;
      st.returningFromDetail = true;
      try{ sessionStorage.setItem('__okCache', JSON.stringify(stateForSave(st))); }catch{}
      const old = location.hash;
      location.hash = href;
      if (old === href) router();
    }
  });

  // Keep scrollY updated only on the Home route (avoid clobbering while in details)
  window.addEventListener('scroll', function () {
    if (!isHomeRoute()) return;
    const st = window.__okCache || (window.__okCache = {});
    st.scrollY = window.scrollY || window.pageYOffset || 0;
  }, { passive: true });
})();
