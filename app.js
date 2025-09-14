// app.js — OkObserver v1.55 (complete)
// - dupe filter on list
// - normalize first paragraph (left-align & remove fake indents)
// - scroll restore & prefetch & hardened embeds
const APP_VERSION = "v1.55";
window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT = "cartoon";
  const app = document.getElementById("app");

  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}

  // Home state cache (session)
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

  // Footer version/year
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

  // Tiny API cache (session)
  const apiCache = new Map();
  const k = (u)=>`__api:${u}`;
  const km = (u)=>`__api:${u}:meta`;
  function getCachedJSON(u){
    if(apiCache.has(u)) return apiCache.get(u);
    try{ const raw=sessionStorage.getItem(k(u)); if(raw){ const v=JSON.parse(raw); apiCache.set(u,v); return v; } }catch{}
    return null;
  }
  function setCachedJSON(u,data,meta){
    apiCache.set(u,data);
    try{ sessionStorage.setItem(k(u), JSON.stringify(data)); }catch{}
    if(meta){ try{ sessionStorage.setItem(km(u), JSON.stringify(meta)); }catch{} }
  }
  function getCachedMeta(u){
    try{ const raw=sessionStorage.getItem(km(u)); if(raw) return JSON.parse(raw); }catch{}
    return null;
  }

  // Optimistic detail shells
  window.__okSummary = window.__okSummary || new Map();
  async function prefetchPost(id){
    const url = `${BASE}/posts/${id}?_embed=1`;
    if (getCachedJSON(url)) return;
    try {
      const res = await fetch(url, {credentials: "omit", priority: "high"});
      if (!res.ok) return;
      const data = await res.json();
      setCachedJSON(url, data);
    } catch {}
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
      if(isInternal){ a.removeAttribute("target"); a.removeAttribute("rel"); return; }
      if(/^https?:\/\//i.test(href)){ a.target="_blank"; a.rel="noopener"; }
    });
  }
  // Content normalization
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
    // Facebook
    root.querySelectorAll(".wp-block-embed-facebook, blockquote.fb-xfbml-parse-ignore, blockquote.facebook-video, div.fb-video, .wp-block-embed__wrapper").forEach(box=>{
      if(hasPlayable(box)) return;
      const a = box.querySelector('a[href*="facebook.com/"]');
      const href = a?.getAttribute("href") || "";
      if(href){
        const fallback = document.createElement("div");
        fallback.className="video-fallback";
        fallback.innerHTML = `
          <div>Video can’t be embedded here.</div>
          <a class="btn" href="${href}" target="_blank" rel="noopener">Watch on Facebook</a>`;
        box.replaceWith(fallback);
        return;
      }
      if(!box.textContent.trim()) box.remove();
    });
    // Vimeo / YouTube
    root.querySelectorAll(".wp-block-embed-vimeo, .wp-block-embed-youtube, .wp-block-embed").forEach(box=>{
      if(hasPlayable(box)) return;
      const a = box.querySelector('a[href*="vimeo.com/"], a[href*="youtube.com/"], a[href*="youtu.be/"]');
      const href = a?.getAttribute("href") || "";
      if(href){
        const provider = href.includes("vimeo.com") ? "Vimeo" : "YouTube";
        const fallback = document.createElement("div");
        fallback.className="video-fallback";
        fallback.innerHTML = `
          <div>Video can’t be embedded here.</div>
          <a class="btn" href="${href}" target="_blank" rel="noopener">Watch on ${provider}</a>`;
        box.replaceWith(fallback);
      } else if(!box.textContent.trim()){
        box.remove();
      }
    });
    // Empty shells
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
    root.querySelectorAll(["figure.wp-block-embed","div.wp-block-embed",".wp-block-embed__wrapper"].join(",")).forEach(c=>{
      if(!c.querySelector("iframe,a,img,video") && !c.textContent.trim()) c.remove();
    });
    deLazyImages(root);
    transformEmbeds(root);
    return root.innerHTML;
  }
  // Helper: normalize first real text paragraph
  function normalizeFirstParagraph(root){
    if(!root) return;
    const blocks = root.querySelectorAll("p, div, section, article, blockquote");
    let firstBlock = null;
    for (const el of blocks) {
      const txt = (el.textContent || "").replace(/\u00A0/g, " ").trim();
      if (txt.length > 0) { firstBlock = el; break; }
    }
    if (!firstBlock) return;
    firstBlock.removeAttribute("align");
    firstBlock.classList.remove("has-text-align-center","has-text-align-right","aligncenter","alignright");
    const style = firstBlock.getAttribute("style") || "";
    const cleaned = style
      .replace(/text-align\s*:\s*(center|right)\s*!?\s*;?/ig, "")
      .replace(/text-indent\s*:\s*[^;]+;?/ig, "")
      .replace(/margin-left\s*:\s*[^;]+;?/ig, "")
      .replace(/padding-left\s*:\s*[^;]+;?/ig, "")
      .trim();
    if (cleaned) firstBlock.setAttribute("style", cleaned); else firstBlock.removeAttribute("style");
    firstBlock.style.setProperty("text-align","left","important");
    firstBlock.style.setProperty("text-indent","0","important");
    firstBlock.style.setProperty("margin-left","0","important");
    firstBlock.style.setProperty("padding-left","0","important");
    const html = firstBlock.innerHTML || "";
    firstBlock.innerHTML = html
      .replace(/^(\s|&nbsp;|&#160;)+/i, "")
      .replace(/^<span[^>]*>(\s|&nbsp;|&#160;)+<\/span>/i, "");
  }

  // Thumbnails & cards
  function thumbHTML(p){
    const art=featuredSrcsetAndSize(p);
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
    const fromContent = firstImgFromHTML(p.content?.rendered || "");
    const fallback = fromContent || firstImgFromHTML(p.excerpt?.rendered || "");
    if (fallback) {
      return `
        <a href="#/post/${p.id}">
          <img class="thumb" src="${fallback}" loading="lazy" decoding="async" alt="">
        </a>`;
    }
    return `<a href="#/post/${p.id}"><div class="thumb"></div></a>`;
  }

  function buildCardElement(p){
    const author=esc(getAuthor(p));
    const date=ordinalDate(p.date);
    const el=document.createElement("div");
    el.className="card";
    el.dataset.postId=p.id;

    const thumb = thumbHTML(p);

    // Cache summary for optimistic shell
    let heroHtml="";
    { const tmp=document.createElement("div");
      tmp.innerHTML=thumb;
      const img=tmp.querySelector("img.thumb");
      if(img){
        img.classList.remove("thumb");
        img.classList.add("hero");
        img.setAttribute("sizes","100vw");
        heroHtml=tmp.innerHTML;
      } }
    window.__okSummary.set(p.id,{title:p.title?.rendered||"",author,date,heroHtml});

    el.innerHTML=`
      ${thumb}
      <div class="card-body">
        <h2 class="title"><a href="#/post/${p.id}" style="color:inherit;text-decoration:none;">${p.title.rendered}</a></h2>
        <div class="meta-author-date">
          ${author?`<span class="author"><strong>${author}</strong></span>`:""}
          <span class="date">${date}</span>
        </div>
        <div class="excerpt">${p.excerpt.rendered}</div>
        <a class="btn" href="#/post/${p.id}">Read more</a>
      </div>`;

    // Prefetch on intent
    el.querySelectorAll('a[href^="#/post/"]').forEach(a=>{
      const once = { once:true, passive:true };
      const id = p.id;
      a.addEventListener("pointerenter", ()=>prefetchPost(id), once);
      a.addEventListener("touchstart",  ()=>prefetchPost(id), once);
    });

    const t=el.querySelector("img.thumb");
    if(t) t.addEventListener("error",()=>{const a=t.closest("a"); if(a) a.innerHTML=`<div class="thumb"></div>`;},{once:true});
    hardenLinks(el.querySelector(".excerpt"));
    return el;
  }

  function observeCardPrefetch(container){
    try{
      const io = new IntersectionObserver((entries, obs)=>{
        for(const e of entries){
          if(e.isIntersecting){
            const id = e.target?.dataset?.postId;
            if (id) prefetchPost(id);
            obs.unobserve(e.target);
          }
        }
      }, { rootMargin: "400px 0px" });
      container.querySelectorAll(".card").forEach(card=>io.observe(card));
    }catch{}
  }
  // Fetch lists & items
  async function fetchPosts({page=1}={}){
    const url=`${BASE}/posts?_embed=1&per_page=${PER_PAGE}&page=${page}`;
    const cached = getCachedJSON(url);
    const meta   = getCachedMeta(url);
    if (cached && meta && typeof meta.totalPages === "number") {
      return { posts: cached.filter(p=>!hasExcluded(p)), totalPages: meta.totalPages };
    }
    const res=await fetch(url,{credentials:"omit"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const totalPages=Number(res.headers.get("X-WP-TotalPages")||"1");
    const items=await res.json();
    setCachedJSON(url, items, { totalPages });
    return { posts: items.filter(p=>!hasExcluded(p)), totalPages };
  }

  async function fetchPost(id){
    const url = `${BASE}/posts/${id}?_embed=1`;
    const res=await fetch(url,{credentials:"omit"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const item=await res.json();
    setCachedJSON(url, item);
    return item;
  }

  // Home renderer (with dupe filter & restore)
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

        // ✅ duplicate guard before pushing
        const existingIds = new Set(window.__okCache.posts.map(p=>p.id));
        const unique = posts.filter(p=>!existingIds.has(p.id));

        const frag=document.createDocumentFragment();
        unique.forEach(p=>{
          frag.appendChild(buildCardElement(p));
          window.__okCache.posts.push(p);
        });
        if(frag.childNodes.length) grid.appendChild(frag);

        observeCardPrefetch(grid);

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
      observeCardPrefetch(grid);

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
      return;
    }

    // Fresh
    setupInfinite();
    await load();
  }
  // About (minimal)
  async function renderAbout(){
    app.innerHTML=`
      <article class="post">
        <h1>About</h1>
        <p>For 57 years, The Oklahoma Observer has served as the state’s journal of free voices…</p>
      </article>`;
  }

  // Detail renderer (optimistic shell, align fixes)
  async function renderPost(id){
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });

    // Remember position for back
    try{
      window.__okCache.scrollY = window.scrollY||0;
      window.__okCache.scrollAnchorPostId = isNaN(+id)?id:+id;
      window.__okCache.returningFromDetail = true;
      saveHomeCache();
      sessionStorage.setItem("__okReturning","1");
    }catch{}

    // Optimistic shell if we have summary
    const sum = window.__okSummary.get(+id) || window.__okSummary.get(id);
    if (sum) {
      app.innerHTML = `
        <article class="post">
          <p><a href="#/" class="btn back-link" style="margin-bottom:12px">← Back to posts</a></p>
          <h1>${sum.title}</h1>
          <div class="meta-author-date">
            ${sum.author?`<span class="author"><strong>${esc(sum.author)}</strong></span>`:""}
            <span class="date">${sum.date}</span>
          </div>
          ${sum.heroHtml || ""}
          <div class="content"><p class="center">Loading…</p></div>
          <p><a href="#/" class="btn back-link" style="margin-top:16px">← Back to posts</a></p>
        </article>`;
      document.querySelectorAll('.post a.back-link').forEach(a=>{
        a.addEventListener('click',(ev)=>{
          ev.preventDefault();
          try { sessionStorage.setItem("__okReturning","1"); } catch {}
          if (history.length > 1) history.back();
          else location.hash = "#/";
        });
      });
    } else {
      app.innerHTML = `<p class="center">Loading post…</p>`;
    }

    // Fetch actual post
    const p = await fetchPost(id);
    if(!p){ app.innerHTML=`<div class="error-banner"><button class="close">×</button>Post not found.</div>`; return; }
    if(hasExcluded(p)){ app.innerHTML=`<div class="error-banner"><button class="close">×</button>This post is not available.</div>`; return; }
    const author=esc(getAuthor(p));
    const date=ordinalDate(p.date);
    const art=featuredSrcsetAndSize(p);
    const heroBlock = art.src ? `
      <img class="hero"
           src="${art.src}"
           ${art.srcset ? `srcset="${art.srcset}" sizes="100vw"` : ""}
           ${art.width ? `width="${art.width}"` : ""}
           ${art.height ? `height="${art.height}"` : ""}
           loading="lazy" decoding="async" alt="">` : "";

    // Normalize content HTML
    const raw=p.content?.rendered||"";
    const normalized=normalizeContent(raw);
    const wrapper=document.createElement("div");
    wrapper.innerHTML=normalized;

    // Alignment cleanup (global)
    (function fixAlign(root){
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
    })(wrapper);

    // First paragraph hardening (strip &nbsp;/indent/align)
    normalizeFirstParagraph(wrapper);

    // Make images sane
    wrapper.querySelectorAll("img").forEach(img=>{
      img.style.display="block";img.style.margin="16px auto";img.style.float="none";img.style.clear="both";
      img.loading="lazy";img.decoding="async";
    });

    // If we rendered optimistic shell, swap content; else render full
    const contentHost = document.querySelector(".post .content");
    const heroHost = document.querySelector(".post img.hero");
    if (contentHost) {
      contentHost.innerHTML = wrapper.innerHTML;
      if (!heroHost && heroBlock) {
        const meta = document.querySelector(".post .meta-author-date");
        if (meta) meta.insertAdjacentHTML("afterend", heroBlock);
      }
      hardenLinks(document.querySelector(".post"));
      const hi = document.querySelector(".post img.hero");
      if(hi){ hi.addEventListener("error",()=>hi.remove(),{once:true}); }
      return;
    }

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
    document.querySelectorAll('.post a.back-link').forEach(a=>{
      a.addEventListener('click', (ev)=>{
        ev.preventDefault();
        try { sessionStorage.setItem("__okReturning","1"); } catch {}
        if (history.length > 1) history.back();
        else location.hash = "#/";
      });
    });
    hardenLinks(document.querySelector(".post"));
  }
  // Router
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
