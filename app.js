// app.js — OkObserver v1.56.3
// Hardened normalizeFirstParagraph + scroll restore + embed fallbacks
const APP_VERSION = "v1.56.3";
window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT = "cartoon";
  const app = document.getElementById("app");

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

  window.addEventListener("DOMContentLoaded",()=>{
    const y=document.getElementById("year"); if(y) y.textContent=new Date().getFullYear();
    const v=document.getElementById("appVersion"); if(v) v.textContent=APP_VERSION;
  });

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
    root.querySelectorAll(".wp-block-embed-facebook, blockquote.fb-xfbml-parse-ignore, blockquote.facebook-video, div.fb-video, .wp-block-embed__wrapper").forEach(box=>{
      if(hasPlayable(box)) return;
      const a = box.querySelector('a[href*="facebook.com/"]');
      const href = a?.getAttribute("href") || "";
      if(href){
        const fallback = document.createElement("div");
        fallback.className="video-fallback";
        fallback.innerHTML = `<div>Video can’t be embedded here.</div><a class="btn" href="${href}" target="_blank" rel="noopener">Watch on Facebook</a>`;
        box.replaceWith(fallback);
      } else if(!box.textContent.trim()) box.remove();
    });
    root.querySelectorAll(".wp-block-embed-vimeo, .wp-block-embed-youtube, .wp-block-embed").forEach(box=>{
      if(hasPlayable(box)) return;
      const a = box.querySelector('a[href*="vimeo.com/"], a[href*="youtube.com/"], a[href*="youtu.be/"]');
      const href = a?.getAttribute("href") || "";
      if(href){
        const provider = href.includes("vimeo.com") ? "Vimeo" : "YouTube";
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
      .replace(/display\s*:\s*inline-block\s*;?/ig,"")
      .replace(/margin\s*:\s*0\s*auto\s*;?/ig,"")
      .trim();

    firstBlock.removeAttribute("align");
    firstBlock.classList.remove("has-text-align-center","has-text-align-right","aligncenter","alignright");
    const style = firstBlock.getAttribute("style") || "";
    const cleaned = scrubStyle(style);
    if (cleaned) firstBlock.setAttribute("style", cleaned); else firstBlock.removeAttribute("style");

    firstBlock.querySelectorAll("span, font, b, i, u, strong, em").forEach(el=>{
      const st = el.getAttribute("style") || "";
      if (!st) return;
      const cs = scrubStyle(st);
      if (cs) el.setAttribute("style", cs); else el.removeAttribute("style");
      el.removeAttribute("align");
      el.classList.remove("has-text-align-center","has-text-align-right","aligncenter","alignright");
    });

    firstBlock.style.setProperty("text-align","left","important");
    firstBlock.style.setProperty("text-indent","0","important");
    firstBlock.style.setProperty("margin-left","0","important");
    firstBlock.style.setProperty("padding-left","0","important");

    let parent = firstBlock.parentElement;
    let hops = 0;
    while (parent && hops < 8) {
      parent.removeAttribute("align");
      parent.classList.remove("has-text-align-center","has-text-align-right","aligncenter","alignright");
      const ps = parent.getAttribute("style") || "";
      const pcs = scrubStyle(ps);
      if (pcs) parent.setAttribute("style", pcs); else parent.removeAttribute("style");
      parent.style.setProperty("text-align","left","important");
      parent = parent.parentElement; hops++;
    }
  }

  // … remainder of app code (renderHome, renderPost, routing) unchanged …
  // The remaining functions (buildCardElement, renderHome, renderPost, routeHook)
  // are the same as your previous working v1.56.3 build.

})();
