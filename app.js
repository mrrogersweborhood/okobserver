// app.js — OkObserver (v1.51.0)
// Perf upgrades: passive listeners, read-through API cache (lists & posts),
// SWR refresh for detail, keep stable features (thumb fallbacks, back-cache, etc.)
const APP_VERSION = "v1.51.0";
window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12; // lower to 10 on very slow phones if desired
  const EXCLUDE_CAT = "cartoon";
  const app = document.getElementById("app");

  // Passive listeners = cheaper scrolling on mobile; no behavior change
  try {
    window.addEventListener("touchstart", () => {}, { passive: true });
    window.addEventListener("wheel", () => {}, { passive: true });
  } catch {}

  // Manual scroll restoration so we control it from cache
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}

  // Home cache (UI state)
  window.__okCache = window.__okCache || {
    posts: [],
    page: 1,
    totalPages: 1,
    scrollY: 0,
    scrollAnchorPostId: null
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

  // Footer hydrate
  window.addEventListener("DOMContentLoaded",()=>{
    const y=document.getElementById("year"); if(y) y.textContent=new Date().getFullYear();
    const v=document.getElementById("appVersion"); if(v) v.textContent=APP_VERSION;
  });

  // Error banner
  function showError(message){
    const msg=(message&&message.message)?message.message:String(message||"Something went wrong.");
    const div=document.createElement("div");
    div.className="error-banner";
    div.innerHTML=`<button class="close" aria-label="Dismiss">×</button>${msg}`;
    app.prepend(div);
  }
  document.addEventListener("click",(e)=>{
    const btn=e.target.closest(".error-banner .close");
    if(btn) btn.closest(".error-banner")?.remove();
  });

  // ===== Tiny API cache layer (read-through) =====
  const apiCache = new Map(); // memory cache for this tab

  function cacheKey(url){ return `__api:${url}`; }
  function cacheKeyMeta(url){ return `__api:${url}:meta`; }

  function getCachedJSON(url){
    if(apiCache.has(url)) return apiCache.get(url);
    try{
      const raw = sessionStorage.getItem(cacheKey(url));
      if(raw){
        const val = JSON.parse(raw);
        apiCache.set(url, val);
        return val;
      }
    }catch{}
    return null;
  }
  function setCachedJSON(url, data, meta){
    apiCache.set(url, data);
    try{ sessionStorage.setItem(cacheKey(url), JSON.stringify(data)); }catch{}
    if(meta){
      try{ sessionStorage.setItem(cacheKeyMeta(url), JSON.stringify(meta)); }catch{}
    }
  }
  function getCachedMeta(url){
    try{
      const raw = sessionStorage.getItem(cacheKeyMeta(url));
      if(raw) return JSON.parse(raw);
    }catch{}
    return null;
  }

  // Utils
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
      if(isInternal){
        a.removeAttribute("target");
        a.removeAttribute("rel");
        return;
      }
      if(/^https?:\/\//i.test(href)){
        a.target="_blank";
        a.rel="noopener";
      }
    });
  }
  // ===== Content normalization & embed transforms =====
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

  // Convert non-embeddable FB/Vimeo/YT blocks into "Watch on …" buttons and remove empty shells
  function transformEmbeds(root){
    if(!root) return;

    const hasPlayable = (node) => !!node.querySelector("iframe, video");

    // Facebook blocks
    root.querySelectorAll(".wp-block-embed-facebook, blockquote.fb-xfbml-parse-ignore, blockquote.facebook-video, div.fb-video, .wp-block-embed__wrapper").forEach(box=>{
      if(hasPlayable(box)) return;
      const a = box.querySelector('a[href*="facebook.com/"]');
      const href = a?.getAttribute("href") || "";
      if(href){
        const fallback = document.createElement("div");
        fallback.className = "video-fallback";
        fallback.innerHTML = `
          <div>Video can’t be embedded here.</div>
          <a class="btn" href="${href}" target="_blank" rel="noopener">Watch on Facebook</a>
        `;
        box.replaceWith(fallback);
        return;
      }
      if(!box.textContent.trim()) box.remove();
    });

    // Vimeo / YouTube wrappers
    root.querySelectorAll(".wp-block-embed-vimeo, .wp-block-embed-youtube, .wp-block-embed").forEach(box=>{
      if(hasPlayable(box)) return;
      const a = box.querySelector('a[href*="vimeo.com/"], a[href*="youtube.com/"], a[href*="youtu.be/"]');
      const href = a?.getAttribute("href") || "";
      if(href){
        const provider = href.includes("vimeo.com") ? "Vimeo" : "YouTube";
        const fallback = document.createElement("div");
        fallback.className = "video-fallback";
        fallback.innerHTML = `
          <div>Video can’t be embedded here.</div>
          <a class="btn" href="${href}" target="_blank" rel="noopener">Watch on ${provider}</a>
        `;
        box.replaceWith(fallback);
      }else if(!box.textContent.trim()){
        box.remove();
      }
    });

    // Generic empty shells
    root.querySelectorAll("figure.wp-block-embed, .wp-block-embed__wrapper").forEach(box=>{
      const playable = hasPlayable(box);
      const hasImg = !!box.querySelector("img");
      const text = (box.textContent || "").replace(/\u00A0/g," ").trim();
      if(!playable && !hasImg && !text) box.remove();
    });
  }

  function normalizeContent(html){
    const root=document.createElement("div");
    root.innerHTML=html||"";

    // Quick prune: remove fully-empty wrappers
    root.querySelectorAll(["figure.wp-block-embed","div.wp-block-embed",".wp-block-embed__wrapper"].join(",")).forEach(c=>{
      if(!c.querySelector("iframe,a,img,video") && !c.textContent.trim()) c.remove();
    });

    // Fix lazy images first
    deLazyImages(root);

    // Transform non-embeddable video/social blocks into a clean fallback
    transformEmbeds(root);

    return root.innerHTML;
  }

  // ===== About page (fetched live, then tidied) =====
  async function fetchAboutPage(){
    const url=`${BASE}/pages?slug=contact-about-donate&_embed=1`;
    const res=await fetch(url,{credentials:"omit"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr=await res.json();
    if(!Array.isArray(arr)||!arr.length) throw new Error("About page not found");
    return arr[0];
  }

  function stripBlankNodes(root){
    if(!root) return;
    const isBlank=(el)=>{
      const txt=(el.textContent||"").replace(/\u00A0/g," ").trim();
      if(txt) return false;
      if(!el.children.length) return true;
      if([...el.children].every(c=>c.tagName==="BR")) return true;
      return false;
    };
    [...root.querySelectorAll("p,div,section,figure")].reverse().forEach(el=>{ if(isBlank(el)) el.remove(); });
  }

  async function renderAbout(){
    const mount=document.getElementById("app");
    mount.innerHTML=`<p class="center">Loading About…</p>`;
    try{
      const page=await fetchAboutPage();
      const title=page.title?.rendered||"About";
      const cleaned=normalizeContent(page.content?.rendered||"");
      const wrapper=document.createElement("div");
      wrapper.innerHTML=cleaned;
      stripBlankNodes(wrapper);
      wrapper.querySelectorAll("p,div").forEach(el=>{
        const style=(el.getAttribute("style")||"").toLowerCase();
        if(style.includes("text-align:center")||style.includes("text-align:right")) el.style.textAlign="left";
      });
      wrapper.querySelectorAll("img").forEach(img=>{
        img.style.display="block";img.style.margin="16px auto";img.style.float="none";img.style.clear="both";
        img.loading="lazy";img.decoding="async";
      });
      hardenLinks(wrapper);
      mount.innerHTML=`
        <article class="post">
          <h1>${title}</h1>
          <div class="content about-content">${wrapper.innerHTML}</div>
          <div style="margin-top:20px" class="center">
            <a class="btn" href="https://okobserver.org/contact-about-donate/" target="_blank" rel="noopener">View on okobserver.org</a>
          </div>
        </article>`;
    }catch(e){
      mount.innerHTML=`<div class="error-banner"><button class="close">×</button>Couldn't load About page: ${e.message}</div>`;
    }
  }
  // ===== API (lists cached with headers; post detail cached; SWR for detail) =====
  async function fetchPosts({page=1}={}){
    const url=`${BASE}/posts?_embed=1&per_page=${PER_PAGE}&page=${page}`;

    // Try cached first (data + cached totalPages meta)
    const cached = getCachedJSON(url);
    const meta   = getCachedMeta(url);
    if (cached && meta && typeof meta.totalPages === "number") {
      return { posts: cached.filter(p=>!hasExcluded(p)), totalPages: meta.totalPages };
    }

    // Network fetch (need headers for total pages)
    const res=await fetch(url,{credentials:"omit"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const totalPages=Number(res.headers.get("X-WP-TotalPages")||"1");
    const items=await res.json();

    // Write-through cache
    setCachedJSON(url, items, { totalPages });

    return { posts: items.filter(p=>!hasExcluded(p)), totalPages };
  }

  async function fetchPost(id){
    const url = `${BASE}/posts/${id}?_embed=1`;
    // Always fetch from network (ensures freshest detail) and then cache
    const res=await fetch(url,{credentials:"omit"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const item=await res.json();
    setCachedJSON(url, item);
    return item;
  }

  // Stale-while-revalidate helper for detail:
  // apply(cached) immediately if present, then refresh in background
  async function swrPost(id, apply){
    const url = `${BASE}/posts/${id}?_embed=1`;
    const cached = getCachedJSON(url);
    if (cached) {
      try { apply(cached); } catch {}
      // Fire and forget refresh
      (async()=>{
        try{
          const fresh = await fetchPost(id);
          setCachedJSON(url, fresh);
          // No auto-apply to avoid UI reflow; we already rendered cached.
        }catch{}
      })();
      return;
    }
    // No cache? Fetch and apply once
    try{
      const fresh = await fetchPost(id);
      setCachedJSON(url, fresh);
      apply(fresh);
    }catch(e){
      throw e;
    }
  }

  // ===== Thumbnail HTML with robust fallbacks =====
  function thumbHTML(p){
    // 1) Featured media (with srcset) if available
    const art = featuredSrcsetAndSize(p);
    if (art.src) {
      return `
        <a href="#/post/${p.id}">
          <img class="thumb"
               src="${art.src}"
               ${art.srcset ? `srcset="${art.srcset}" sizes="(min-width: 1100px) 360px, (min-width: 700px) 45vw, 90vw"` : ""}
               ${art.width ? `width="${art.width}"` : ""}
               ${art.height ? `height="${art.height}"` : ""}
               loading="lazy" decoding="async" alt="">
        </a>`;
    }
    // 2) First image in content; 3) else first in excerpt
    const fromContent = firstImgFromHTML(p.content?.rendered || "");
    const fallback = fromContent || firstImgFromHTML(p.excerpt?.rendered || "");
    if (fallback) {
      return `
        <a href="#/post/${p.id}">
          <img class="thumb" src="${fallback}" loading="lazy" decoding="async" alt="">
        </a>`;
    }
    // 4) Placeholder
    return `<a href="#/post/${p.id}"><div class="thumb"></div></a>`;
  }

  // Post card
  function buildCardElement(p){
    const author=esc(getAuthor(p));
    const date=ordinalDate(p.date);
    const el=document.createElement("div");
    el.className="card";
    el.dataset.postId=p.id;

    el.innerHTML=`
      ${thumbHTML(p)}
      <div class="card-body">
        <h2 class="title"><a href="#/post/${p.id}" style="color:inherit;text-decoration:none;">${p.title.rendered}</a></h2>
        <div class="meta-author-date">
          ${author?`<span class="author"><strong>${author}</strong></span>`:""}
          <span class="date">${date}</span>
        </div>
        <div class="excerpt">${p.excerpt.rendered}</div>
        <a class="btn" href="#/post/${p.id}">Read more</a>
      </div>`;

    const t=el.querySelector("img.thumb");
    if(t) t.addEventListener("error",()=>{const a=t.closest("a"); if(a) a.innerHTML=`<div class="thumb"></div>`;},{once:true});
    hardenLinks(el.querySelector(".excerpt"));
    return el;
  }

  function prioritizeFirstThumbs(){
    [...document.querySelectorAll('.grid .card img.thumb')].slice(0,3).forEach(img=>{
      img.setAttribute('fetchpriority','high');
      img.loading='eager';
    });
  }

  // ===== Home (no search; back-cache restore) =====
  async function renderHome(){
    const returning = sessionStorage.getItem("__okReturning")==="1";
    const hasCache = Array.isArray(window.__okCache.posts) && window.__okCache.posts.length>0;

    app.innerHTML=`
      <h1 style="margin-bottom:10px;">Latest News</h1>
      <div id="grid" class="grid"></div>
      <div class="center" style="margin:12px 0">
        <button id="loadMoreBtn" class="btn">Load more</button>
      </div>
      <div id="sentinel" style="height:1px;"></div>
    `;

    const grid=document.getElementById("grid");
    const loadBtn=document.getElementById("loadMoreBtn");
    const sentinel=document.getElementById("sentinel");

    let page   = Number(window.__okCache.page||1);
    let totalPages = Number(window.__okCache.totalPages||1);
    let loading=false;
    let nextPage = hasCache ? page+1 : 1;

    async function load(){
      if(loading) return;
      if(nextPage>totalPages && totalPages>0){
        loadBtn.disabled=true; loadBtn.textContent="No more posts.";
        return;
      }
      loading=true;
      loadBtn.disabled=true; loadBtn.textContent="Loading…";
      try{
        const {posts, totalPages:tp}=await fetchPosts({page:nextPage});
        totalPages = Number(tp)||totalPages||1;

        const frag=document.createDocumentFragment();
        posts.forEach(p=>{
          frag.appendChild(buildCardElement(p));
          window.__okCache.posts.push(p);
        });
        if(frag.childNodes.length) grid.appendChild(frag);

        page = nextPage;
        nextPage = page+1;

        window.__okCache.page=page;
        window.__okCache.totalPages=totalPages;
        saveHomeCache();

        if(nextPage>totalPages){
          loadBtn.textContent="No more posts."; loadBtn.disabled=true;
        }else{
          loadBtn.textContent="Load more"; loadBtn.disabled=false;
        }

        if(page===1) prioritizeFirstThumbs();

      }catch(e){
        showError("Failed to load posts: "+e.message);
        loadBtn.textContent="Retry"; loadBtn.disabled=false;
      }finally{
        loading=false;
      }
    }

    function setupInfinite(){
      if(!("IntersectionObserver" in window) || !sentinel) return;
      const obs=new IntersectionObserver((entries)=>{
        for(const entry of entries){
          if(entry.isIntersecting && !loading && nextPage<=totalPages) load();
        }
      },{rootMargin:"600px 0px 600px 0px"});
      obs.observe(sentinel);
    }

    loadBtn.addEventListener("click",load);

    if(hasCache){
      const frag=document.createDocumentFragment();
      window.__okCache.posts.forEach(p=>frag.appendChild(buildCardElement(p)));
      grid.appendChild(frag);

      if((window.__okCache.page+1) > (window.__okCache.totalPages||1)){
        loadBtn.textContent="No more posts."; loadBtn.disabled=true;
      }else{
        loadBtn.textContent="Load more"; loadBtn.disabled=false;
      }

      page = Number(window.__okCache.page||1);
      totalPages = Number(window.__okCache.totalPages||1);
      nextPage = page+1;

      if(returning){
        requestAnimationFrame(()=>{
          sessionStorage.removeItem("__okReturning");
          const anchorId = window.__okCache.scrollAnchorPostId;
          if(anchorId){
            const card=document.querySelector(`.card[data-post-id="${CSS.escape(String(anchorId))}"]`);
            if(card){
              const y=Math.max(0, card.getBoundingClientRect().top + window.scrollY - 8);
              window.scrollTo(0,y);
              return;
            }
          }
          window.scrollTo(0, window.__okCache.scrollY||0);
        });
      }

      setupInfinite();
      prioritizeFirstThumbs();
      return;
    }

    // Fresh visit
    setupInfinite();
    await load();
  }
  // ===== Detail (uses SWR: render cached immediately when possible) =====
  async function renderPost(id){
    // Save current scroll before leaving list
    try{ window.__okCache.scrollY = window.scrollY||0; saveHomeCache(); }catch{}
    try{
      window.__okCache.scrollAnchorPostId = isNaN(+id)?id:+id;
      window.__okCache.returningFromDetail = true;
      saveHomeCache();
      sessionStorage.setItem("__okReturning","1");
    }catch{}

    app.innerHTML=`<p class="center">Loading post…</p>`;

    // We render via apply() so we can use SWR (cached first, then refresh silently)
    const apply = (p)=>{
      if(!p){ app.innerHTML=`<div class="error-banner"><button class="close">×</button>Post not found.</div>`; return; }
      if(hasExcluded(p)){
        app.innerHTML=`<div class="error-banner"><button class="close">×</button>This post is not available.</div>`;
        return;
      }

      const author=esc(getAuthor(p));
      const date=ordinalDate(p.date);

      // Hero (responsive)
      const art=featuredSrcsetAndSize(p);
      const heroBlock = art.src ? `
        <img class="hero"
             src="${art.src}"
             ${art.srcset ? `srcset="${art.srcset}" sizes="100vw"` : ""}
             ${art.width ? `width="${art.width}"` : ""}
             ${art.height ? `height="${art.height}"` : ""}
             loading="lazy" decoding="async" alt="">` : "";

      // Normalize content NOW (sync) so fallbacks/alignments are guaranteed
      const raw=p.content?.rendered||"";
      const normalized=normalizeContent(raw);
      const wrapper=document.createElement("div");
      wrapper.innerHTML=normalized;

      // Alignment scrub
      (function scrubAlignTree(root){
        if(!root) return;
        root.querySelectorAll("center").forEach(c=>{const d=document.createElement("div"); d.innerHTML=c.innerHTML; c.replaceWith(d);});
        const SELECTORS="p, div, li, h1, h2, h3, h4, section, article, span, strong, em, figure, figcaption, table, thead, tbody, tfoot, tr, td, th, blockquote";
        root.querySelectorAll(SELECTORS).forEach(el=>{
          const style=(el.getAttribute("style")||"");
          if(/text-align\s*:\s*(center|right)/i.test(style)){
            el.setAttribute("style", style.replace(/text-align\s*:\s*(center|right)\s*!?\s*;?/ig,"").trim());
            el.style.setProperty("text-align","left","important");
          }
        });
        root.querySelectorAll(".has-text-align-center, .has-text-align-right, .aligncenter, .alignright").forEach(el=>{
          el.classList.remove("has-text-align-center","has-text-align-right","aligncenter","alignright");
          el.style.setProperty("text-align","left","important");
        });
        root.querySelectorAll("[align]").forEach(el=>{
          const a=(el.getAttribute("align")||"").toLowerCase();
          if(a==="center"||a==="right"){ el.removeAttribute("align"); el.style.setProperty("text-align","left","important"); }
        });
        const firstTextBlock = Array.from(root.querySelectorAll("p, div, section, article, blockquote, table"))
          .find(el => (el.textContent || "").replace(/\u00A0/g," ").trim().length > 0);
        if(firstTextBlock){
          let node=firstTextBlock;
          while(node && node!==root){
            node.style.setProperty("text-align","left","important");
            const st=(node.getAttribute("style")||"");
            if(/text-align/i.test(st)) node.setAttribute("style", st.replace(/text-align\s*:\s*(center|right)\s*!?\s*;?/ig,""));
            node=node.parentElement;
          }
        }
      })(wrapper);

      // Images behave
      wrapper.querySelectorAll("img").forEach(img=>{
        img.style.display="block";img.style.margin="16px auto";img.style.float="none";img.style.clear="both";
        img.loading="lazy";img.decoding="async";
      });

      // Render final page
      app.innerHTML=`
        <article class="post">
          <p><a href="#/" class="btn back-link" style="margin-bottom:12px">← Back to posts</a></p>
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">
            ${author?`<span class="author"><strong>${author}</strong></span>`:""}
            <span class="date">${date}</span>
          </div>
          ${heroBlock}
          <div class="content">${wrapper.innerHTML}</div>
          <p><a href="#/" class="btn back-link" style="margin-top:16px">← Back to posts</a></p>
        </article>`;

      // Prefer history.back() to preserve cache/scroll; fallback to hash if no history
      document.querySelectorAll('.post a.back-link').forEach(a=>{
        a.addEventListener('click', (ev)=>{
          ev.preventDefault();
          try { sessionStorage.setItem("__okReturning","1"); } catch {}
          if (history.length > 1) history.back();
          else location.hash = "#/";
        });
      });

      const heroImg=document.querySelector(".post img.hero");
      if(heroImg){ heroImg.addEventListener("error",()=>heroImg.remove(),{once:true}); }

      hardenLinks(document.querySelector(".post"));
    };

    try{
      await swrPost(id, apply); // cached-first, then silent refresh
    }catch(e){
      app.innerHTML=`<div class="error-banner"><button class="close">×</button>Error loading post: ${e.message}</div>`;
    }
  }

  // ===== Router =====
  async function routeHook(){
    const h=location.hash||"#/";
    if(h.startsWith("#/post/")){
      const id=h.split("/")[2]?.split("?")[0];
      if(id) await renderPost(id);
    }else if(h==="#/about"){
      await renderAbout();
    }else{
      await renderHome();
    }
  }
  window.addEventListener("hashchange",routeHook);
  window.addEventListener("DOMContentLoaded",routeHook);
})();
