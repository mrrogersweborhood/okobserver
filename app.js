/* app.js — OkObserver (monolithic build) — v1.71.0
   Speed-ups & fixes:
   • Lean home fetch: posts with _fields only (no huge _embed)
   • Batch fetch media & authors per page, memoize results
   • Author fetch is NON-FATAL (sites may block /users)
   • Server-side exclude for "cartoon" category (keeps lean path)
   • Page cache in sessionStorage (per page) + cache version bump
   • DOM insert batching; IO reuse; scroll restore intact
*/
(function () {
  "use strict";

  const APP_VERSION = "v1.71.0";
  window.APP_VERSION = APP_VERSION;
  console.info("OkObserver app loaded", APP_VERSION);

  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;

  // ---- Cache version bump (flushes old cached pages once)
  const CACHE_VERSION = "home-v2";

  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}

  const state = (window.__okCache = window.__okCache || {
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
    _sentinel: null,
  });

  function stateForSave(st){ const { _io, _sentinel, isLoading, ...rest } = st || {}; return rest; }
  function saveHomeCache(){ try{ sessionStorage.setItem("__okCache", JSON.stringify(stateForSave(state))); }catch{} }
  (function rehydrate(){
    try{ const raw=sessionStorage.getItem("__okCache"); if(raw) Object.assign(state, JSON.parse(raw)||{}); }catch{}
    state._io=null; state._sentinel=null; state.isLoading=false;
  })();

  // One-time cache invalidation for older page caches
  try {
    const cv = sessionStorage.getItem("__home_cache_version");
    if (cv !== CACHE_VERSION) {
      Object.keys(sessionStorage).forEach(k => { if (k && k.startsWith("__home_page_")) sessionStorage.removeItem(k); });
      sessionStorage.setItem("__home_cache_version", CACHE_VERSION);
    }
  } catch {}

  const app = () => document.getElementById("app");

  function showError(message){
    const host = app() || document.body;
    const msg = (message && message.message) ? message.message : String(message || "Something went wrong.");
    const div = document.createElement("div");
    div.className = "error-banner";
    div.innerHTML = '<button class="close" aria-label="Dismiss">×</button>' + msg;
    host.prepend(div);
  }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".error-banner .close");
    if (btn) btn.closest(".error-banner")?.remove();
  });

  const esc = (s="") => s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const __decoderEl = document.createElement("textarea");
  function decodeEntities(str){ __decoderEl.innerHTML = str || ''; return __decoderEl.value; }

  function ordinalDate(iso){
    const d = new Date(iso); const day = d.getDate();
    const suf = (n) => (n>3 && n<21) ? "th" : (["th","st","nd","rd"][Math.min(n%10,4)] || "th");
    return d.toLocaleString("en-US",{month:"long"}) + " " + day + suf(day) + ", " + d.getFullYear();
  }

  function whenImagesSettled(root, timeout = 2000){
    return new Promise((resolve)=>{
      const imgs = Array.from((root || document).querySelectorAll("img"));
      if(!imgs.length) return resolve();
      let settled=false, seen=0;
      const check=()=>{ if(settled) return; seen+=1; if(seen>=imgs.length){ settled=true; resolve(); } };
      imgs.forEach(img=>{
        if(img.complete) check();
        else { img.addEventListener("load", check, { once:true }); img.addEventListener("error", check, { once:true }); }
      });
      setTimeout(()=>{ if(!settled) resolve(); }, timeout);
    });
  }

  function deLazyImages(root){
    if(!root) return;
    root.querySelectorAll("img").forEach(img=>{
      const realSrc = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original") || "";
      const realSrcset = img.getAttribute("data-srcset") || img.getAttribute("data-lazy-srcset") || "";
      if (realSrc) img.setAttribute("src", realSrc);
      if (realSrcset) img.setAttribute("srcset", realSrcset);
      img.classList.remove("lazyload","lazy","jetpack-lazy-image");
      img.loading = "lazy"; img.decoding = "async";
      img.style.maxWidth = "100%"; img.style.height = "auto";
      img.style.objectFit = "contain"; img.style.display = "block";
    });
  }

  function transformEmbeds(root){
    if(!root) return;
    const hasPlayable = (node) => !!node.querySelector('iframe, video');
    root.querySelectorAll('.wp-block-embed__wrapper, .wp-block-embed').forEach((box)=>{
      if (hasPlayable(box)) return;
      const a = box.querySelector('a[href*="youtube.com/"], a[href*="youtu.be/"], a[href*="vimeo.com/"], a[href*="facebook.com/"]');
      const href = a ? a.getAttribute('href') : '';
      if (href){
        const provider = href.includes('vimeo.com') ? 'Vimeo' : ((href.includes('youtube') || href.includes('youtu.be')) ? 'YouTube' : 'Facebook');
        const fallback = document.createElement('div');
        fallback.className = 'video-fallback';
        fallback.innerHTML = '<div>Video can’t be embedded here.</div><a class="btn" href="' + href + '" target="_blank" rel="noopener">Watch on ' + provider + '</a>';
        box.replaceWith(fallback);
      } else if (!box.textContent.trim()){
        box.remove();
      }
    });
  }

  function normalizeFirstParagraph(root){
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(node){
      const t = (node.nodeValue || '').replace(/\u00A0/g, ' ').trim();
      return t ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }});
    const firstText = walker.nextNode(); if (!firstText) return;
    let el = firstText.parentElement;
    while (el && el !== root && el.tagName !== 'P') el = el.parentElement;
    if (!el || el === root) el = root.querySelector('p');
    if (!el) return;
    el.innerHTML = el.innerHTML.replace(/^(\u00A0|&nbsp;|\s)+/i, '');
    const zeroOut = (node) => {
      node.style.setProperty('text-indent','0','important');
      node.style.setProperty('margin-left','0','important');
      node.style.setProperty('padding-left','0','important');
      node.style.setProperty('text-align','left','important');
    };
    zeroOut(el);
    let parent = el.parentElement;
    while (parent && parent !== root && !parent.classList.contains('content')) {
      const tag = (parent.tagName || '').toLowerCase();
      if (['div','section','article','blockquote','figure'].includes(tag)) zeroOut(parent);
      parent = parent.parentElement;
    }
  }

  function normalizeContent(html){
    const root = document.createElement('div'); root.innerHTML = html || '';

    // Remove empty blocks & stray whitespace-only nodes
    root.querySelectorAll('p,div,section,article,blockquote,figure').forEach(el=>{
      if (!el.textContent.trim() && !el.querySelector('img,iframe,video')) el.remove();
    });
    root.querySelectorAll('br+br+br').forEach(br=>{ br.remove(); });

    root.querySelectorAll('figure.wp-block-embed,.wp-block-embed__wrapper').forEach((c)=>{
      if (!c.querySelector('iframe,a,img,video') && !c.textContent.trim()) c.remove();
    });

    deLazyImages(root);
    transformEmbeds(root);
    return root.innerHTML;
  }

  function hardenLinks(root){
    if(!root) return;
    root.querySelectorAll('a[href]').forEach((a)=>{
      const href = a.getAttribute('href') || '';
      const isInternal = href.startsWith('#/');
      if (isInternal){ a.removeAttribute('target'); a.removeAttribute('rel'); return; }
      if (/^https?:\/\//i.test(href)){ a.target = '_blank'; a.rel = 'noopener'; }
    });
  }

  const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  function isHomeRoute(){ const h = window.location.hash || "#/"; return h === "#/" || h === "#"; }

  const controllers = { listAbort: null, detailAbort: null, aboutAbort: null };

  // -- Category resolver (cache in sessionStorage) for server-side exclude
  const CARTOON_SLUG = "cartoon";
  let CARTOON_CAT_ID = null;
  function getCachedCartoonId(){ try { const v = sessionStorage.getItem("__cat_cartoon_id"); return v ? Number(v) : null; } catch { return null; } }
  function putCachedCartoonId(id){ try { sessionStorage.setItem("__cat_cartoon_id", String(id)); } catch {} }
  async function resolveCartoonId(signal){
    if (CARTOON_CAT_ID != null) return CARTOON_CAT_ID;
    const cached = getCachedCartoonId();
    if (Number.isFinite(cached)) { CARTOON_CAT_ID = cached; return CARTOON_CAT_ID; }
    try {
      const url = `${BASE}/categories?slug=${encodeURIComponent(CARTOON_SLUG)}&_fields=id,slug`;
      const res = await fetch(url, { headers:{Accept:"application/json"}, signal });
      if (!res.ok) throw new Error("cat lookup " + res.status);
      const arr = await res.json();
      const id = Array.isArray(arr) && arr[0]?.id ? Number(arr[0].id) : null;
      CARTOON_CAT_ID = Number.isFinite(id) ? id : null;
      if (CARTOON_CAT_ID != null) putCachedCartoonId(CARTOON_CAT_ID);
    } catch { CARTOON_CAT_ID = null; }
    return CARTOON_CAT_ID;
  }
  async function loadNextPage(){
    if (!isHomeRoute()) return;
    if (state.isLoading) return;
    if (Number.isFinite(state.totalPages) && state.page >= state.totalPages) return;

    if (controllers.listAbort){ try{ controllers.listAbort.abort(); }catch{} }
    controllers.listAbort = new AbortController();

    state.isLoading=true; saveHomeCache(); showLoader();
    try{
      const next=(state.page||1)+1;
      const { posts:newPosts, totalPages } = await fetchLeanPostsPage(next, controllers.listAbort.signal);
      state.posts=(state.posts||[]).concat(newPosts || []);
      state.page=next;
      if (Number.isFinite(totalPages)) state.totalPages = totalPages;
      else if (Array.isArray(newPosts) && newPosts.length < PER_PAGE) state.totalPages = state.page;
      saveHomeCache(); renderGridFromPosts(newPosts, true);
    }catch(err){ if(err?.name!=='AbortError') showError(err); }
    finally{ hideLoader(); state.isLoading=false; saveHomeCache(); }
  }

  function ensureInfiniteScroll(){
    const sentinel = getSentinel();
    if (state._io && typeof state._io.observe === 'function'){
      if (state._sentinel && state._sentinel !== sentinel){ try{ state._io.unobserve(state._sentinel);}catch{} }
      state._io.observe(sentinel); state._sentinel = sentinel; return;
    }
    if (!state._io){
      state._io=new IntersectionObserver((entries)=>{
        const e=entries[0];
        if(!e||!e.isIntersecting) return;
        if (!isHomeRoute()) return;
        loadNextPage();
      }, { root:null, rootMargin:"1000px 0px", threshold:0 });
    }
    state._io.observe(sentinel);
    state._sentinel = sentinel; state._ioAttached = true;
  }

  async function renderHome(){
    if (!app()) return;

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
          state.returningFromDetail=false; saveHomeCache();
        }
      })();
      return;
    }

    app().innerHTML = `<p class="center">Loading…</p>`;
    if (controllers.listAbort){ try{ controllers.listAbort.abort(); }catch{} }
    controllers.listAbort = new AbortController();

    try{
      // Lean first page (with server-side cartoon exclude)
      const { posts, totalPages } = await fetchLeanPostsPage(1, controllers.listAbort.signal);
      if (!Array.isArray(posts) || !posts.length){
        app().innerHTML=""; showError("No posts returned from the server.");
        renderGridFromPosts([], false); ensureInfiniteScroll(); return;
      }

      app().innerHTML=""; renderGridFromPosts(posts,false); ensureInfiniteScroll();
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
      app().innerHTML=""; renderGridFromPosts([], false);
    }
  }

  function attachScrollFallback(){
    window.addEventListener('scroll', function () {
      if (!isHomeRoute()) return;
      if (state.isLoading) return;
      const nearBottom = (window.innerHeight + (window.scrollY || window.pageYOffset || 0)) >= (document.body.scrollHeight - 800);
      if (nearBottom) {
        if (!state._io || typeof state._io.observe !== 'function') ensureInfiniteScroll();
        loadNextPage();
      }
    }, { passive: true });
  }

  // ===== Detail view =====
  function featuredSrcFromPost(p){
    const m=p?._embedded?.["wp:featuredmedia"]?.[0];
    if(!m) return { src:"", width:null, height:null };
    const sizes=m.media_details?.sizes||{};
    const order=["2048x2048","1536x1536","large","medium_large","medium","thumbnail"];
    const best = order.map(k=>sizes[k]).find(s=>s?.source_url) || null;
    return { src:(best?.source_url || m.source_url || ""), width:(best?.width||null), height:(best?.height||null) };
  }

  function renderPostShell(){
    try{ const ld=document.getElementById("infiniteLoader"); if(ld) ld.remove(); }catch{}
    if (!app()) return;
    app().innerHTML = `
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
      </article>`;
    const goHome = (e)=>{
      e?.preventDefault?.();
      state.returningFromDetail = true;
      try{ sessionStorage.setItem("__okCache", JSON.stringify(stateForSave(state))); }catch{}
      location.hash = "#/";
    };
    document.getElementById("backBottom")?.addEventListener("click", goHome);
  }

  async function renderPost(id){
    renderPostShell();
    if (controllers.detailAbort){ try{ controllers.detailAbort.abort(); }catch{} }
    controllers.detailAbort = new AbortController();
    const url = `${BASE}/posts/${id}?_embed=1`;
    try{
      const res = await fetch(url, { headers:{Accept:"application/json"}, signal: controllers.detailAbort.signal });
      if(!res.ok) throw new Error('Post not found');
      const post = await res.json();
      const { src, width, height } = featuredSrcFromPost(post);
      const author =
        post?._embedded?.author?.[0]?.name ||
        authorMap.get(post.author) || "";
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

    } catch(err){
      if (err?.name !== 'AbortError') showError(err);
      const backBtn = document.getElementById('backBottom');
      if (backBtn) backBtn.style.display = '';
    }
  }
  // ===== About (cached) =====
  const ABOUT_CACHE_KEY = "__about_html";
  const ABOUT_CACHE_TS_KEY = "__about_ts";
  const ABOUT_TTL_MS = 60 * 60 * 1000; // 1 hour

  function renderAboutShell(){
    if (!app()) return;
    app().innerHTML = `
      <article class="page" id="aboutPage">
        <h1>About</h1>
        <div class="content" id="aboutContent"><p class="center">Loading…</p></div>
      </article>`;
  }

  function putAboutCache(html){
    try {
      sessionStorage.setItem(ABOUT_CACHE_KEY, html || "");
      sessionStorage.setItem(ABOUT_CACHE_TS_KEY, String(Date.now()));
    } catch {}
  }
  function getAboutCache(){
    try {
      const ts = Number(sessionStorage.getItem(ABOUT_CACHE_TS_KEY) || 0);
      if (!ts) return null;
      if (Date.now() - ts > ABOUT_TTL_MS) return null;
      return sessionStorage.getItem(ABOUT_CACHE_KEY) || null;
    } catch { return null; }
  }

  async function renderAbout(){
    renderAboutShell();
    const host = document.getElementById("aboutContent");
    if (!host) return;

    const cached = getAboutCache();
    if (cached){
      host.innerHTML = cached;
      try { normalizeFirstParagraph(host); } catch {}
      try { hardenLinks(host); } catch {}
    }

    if (controllers.aboutAbort){ try{ controllers.aboutAbort.abort(); }catch{} }
    controllers.aboutAbort = new AbortController();

    const url = `${BASE}/pages?slug=contact-about-donate&_embed=1`;
    try{
      const res = await fetch(url, { headers:{Accept:"application/json"}, signal: controllers.aboutAbort.signal });
      if(!res.ok) throw new Error(`About page not available (${res.status})`);
      const pages = await res.json();
      const page = Array.isArray(pages) ? pages[0] : null;

      if (!page){
        if (!cached) host.innerHTML = `<p>Could not load About page content.</p>`;
        return;
      }

      const html = normalizeContent(page?.content?.rendered || "");
      const tmp = document.createElement("div");
      tmp.innerHTML = html;

      tmp.querySelectorAll('p,div,section,article,blockquote,figure').forEach(el=>{
        const hasMedia = !!el.querySelector('img,iframe,video');
        if (!el.textContent.trim() && !hasMedia) el.remove();
      });
      tmp.querySelectorAll('br+br+br').forEach(br=>br.remove());
      tmp.querySelectorAll('img').forEach(img=>{
        img.style.maxWidth = "100%";
        img.style.height = "auto";
        img.style.objectFit = "contain";
        img.style.display = "block";
        if (!img.style.margin) img.style.margin = "8px auto";
      });

      const cleaned = tmp.innerHTML;
      putAboutCache(cleaned);
      host.innerHTML = cleaned;

      try { normalizeFirstParagraph(host); } catch {}
      try { hardenLinks(host); } catch {}

    } catch(err){
      if (!cached){
        if (err?.name !== 'AbortError') showError(err);
        host.innerHTML = `<p>Unable to load About page at this time.</p>`;
      }
    }
  }

  // ===== Router & wiring =====
  async function router(){
    const hash = window.location.hash || "#/";
    const m = hash.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);
    if (m && m[1]) {
      await renderPost(m[1]);
    } else if (hash.startsWith("#/about")) {
      await renderAbout();
    } else {
      await renderHome();
    }
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("DOMContentLoaded", router);
  if (document.readyState === "interactive" || document.readyState === "complete") { router(); }

  // Save cursor/scroll before navigating to detail
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
      if (old === href) router();
    }
  });

  // Track home scroll
  window.addEventListener('scroll', function () {
    if (!isHomeRoute()) return;
    state.scrollY = window.scrollY || window.pageYOffset || 0;
  }, { passive: true });

  // Fallback infinite scroll
  function attachScrollFallback(){
    window.addEventListener('scroll', function () {
      if (!isHomeRoute()) return;
      if (state.isLoading) return;
      const nearBottom = (window.innerHeight + (window.scrollY || window.pageYOffset || 0)) >= (document.body.scrollHeight - 800);
      if (nearBottom) {
        if (!state._io || typeof state._io.observe !== 'function') ensureInfiniteScroll();
        loadNextPage();
      }
    }, { passive: true });
  }
  attachScrollFallback();
})();
