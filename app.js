/* app.js — OkObserver (monolithic build) — v1.61.0
   Adds: #/about page (fetches okobserver.org/contact-about-donate),
   image containment, empty-line cleanup; keeps infinite scroll, scroll restore.
*/
(function () {
  "use strict";

  const APP_VERSION = "v1.61.0";
  window.APP_VERSION = APP_VERSION;
  console.info("OkObserver app loaded", APP_VERSION);

  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT = "cartoon";

  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}

  const state = (window.__okCache = window.__okCache || {
    posts: [], page: 1, totalPages: null, scrollY: 0, homeScrollY: 0,
    scrollAnchorPostId: null, returningFromDetail: false, isLoading: false,
    _ioAttached: false, _io: null, _sentinel: null,
  });

  function stateForSave(st){ const { _io, _sentinel, isLoading, ...rest } = st || {}; return rest; }
  function saveHomeCache(){ try{ sessionStorage.setItem("__okCache", JSON.stringify(stateForSave(state))); }catch{} }
  (function rehydrate(){ try{ const raw=sessionStorage.getItem("__okCache"); if(raw) Object.assign(state, JSON.parse(raw)||{}); }catch{} state._io=null; state._sentinel=null; state.isLoading=false; })();

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
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.style.objectFit = "contain";
      img.style.display = "block";
      img.style.margin = "0 auto";
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
    // Collapse multiple <br> stacks
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
  // ---------- HOME (grid + infinite scroll)
  function getAuthor(p){ return p?._embedded?.author?.[0]?.name || ""; }
  function hasExcluded(p){
    const groups=p?._embedded?.["wp:term"]||[];
    const cats=groups.flat().filter(t=>(t?.taxonomy||"").toLowerCase()==="category");
    const norm=(x)=>(x||"").trim().toLowerCase();
    return cats.some(c=>norm(c.slug)===EXCLUDE_CAT || norm(c.name)===EXCLUDE_CAT);
  }

  function buildCardElement(post){
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
    const titleHTML = post?.title?.rendered || "Untitled";

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

  function renderGridFromPosts(posts, append=false){
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

  async function loadNextPage(){
    if (!isHomeRoute()) return;
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

  function ensureInfiniteScroll(){
    const sentinel = getSentinel();
    if (state._io && typeof state._io.observe === 'function'){
      if (state._sentinel && state._sentinel !== sentinel){ try{ state._io.unobserve(state._sentinel);}catch{} }
      state._io.observe(sentinel); state._sentinel = sentinel; return;
    }
    const io=new IntersectionObserver((entries)=>{
      const e=entries[0];
      if(!e||!e.isIntersecting) return;
      if (!isHomeRoute()) return;
      loadNextPage();
    }, { root:null, rootMargin:"1000px 0px", threshold:0 });
    io.observe(sentinel);
    state._io = io; state._sentinel = sentinel; state._ioAttached = true;
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

  // ---------- DETAIL
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

    } catch(err){
      if (err?.name !== 'AbortError') showError(err);
      const backBtn = document.getElementById('backBottom');
      if (backBtn) backBtn.style.display = '';
    }
  }
  // ---------- ABOUT (new page)
  function renderAboutShell(){
    if (!app()) return;
    app().innerHTML = `
      <article class="page" id="aboutPage">
        <h1>About</h1>
        <div class="content" id="aboutContent"><p class="center">Loading…</p></div>
      </article>`;
  }

  async function renderAbout(){
    renderAboutShell();
    if (controllers.aboutAbort){ try{ controllers.aboutAbort.abort(); }catch{} }
    controllers.aboutAbort = new AbortController();

    // Use WP REST API by slug (safer than scraping raw HTML)
    const url = `${BASE}/pages?slug=contact-about-donate&_embed=1`;
    try{
      const res = await fetch(url, { headers:{Accept:"application/json"}, signal: controllers.aboutAbort.signal });
      if(!res.ok) throw new Error(`About page not available (${res.status})`);
      const pages = await res.json();
      const page = Array.isArray(pages) ? pages[0] : null;

      const host = document.getElementById("aboutContent");
      if (!host){ return; }

      if (!page){
        host.innerHTML = `<p>Could not load About page content.</p>`;
        return;
      }

      // Clean & normalize HTML
      const html = normalizeContent(page?.content?.rendered || "");
      const tmp = document.createElement("div");
      tmp.innerHTML = html;

      // Remove extra blank blocks & whitespace-only nodes
      tmp.querySelectorAll('p,div,section,article,blockquote,figure').forEach(el=>{
        const hasMedia = !!el.querySelector('img,iframe,video');
        if (!el.textContent.trim() && !hasMedia) el.remove();
      });
      tmp.querySelectorAll('br+br+br').forEach(br=>br.remove());

      // Images shouldn’t cover text
      tmp.querySelectorAll('img').forEach(img=>{
        img.style.maxWidth = "100%";
        img.style.height = "auto";
        img.style.objectFit = "contain";
        img.style.display = "block";
        if (!img.style.margin) img.style.margin = "8px auto";
      });

      host.innerHTML = tmp.innerHTML;

      // Final polish
      try { normalizeFirstParagraph(host); } catch {}
      try { hardenLinks(host); } catch {}

    } catch(err){
      if (err?.name !== 'AbortError') showError(err);
      const host = document.getElementById("aboutContent");
      if (host) host.innerHTML = `<p>Unable to load About page at this time.</p>`;
    }
  }

  // ---------- Router & wiring
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

  // Track home scroll to improve restoration
  window.addEventListener('scroll', function () {
    if (!isHomeRoute()) return;
    state.scrollY = window.scrollY || window.pageYOffset || 0;
  }, { passive: true });

  // Fallback infinite scroll (in addition to IntersectionObserver)
  attachScrollFallback();
})();
