// utils.js — helpers
export function showError(message){
  const host = document.getElementById("app") || document.body;
  const msg=(message&&message.message)?message.message:String(message||"Something went wrong.");
  const div=document.createElement("div");
  div.className="error-banner";
  div.innerHTML=`<button class="close" aria-label="Dismiss">×</button>${msg}`;
  host.prepend(div);
}
document.addEventListener("click",(e)=>{
  const btn=e.target.closest(".error-banner .close");
  if(btn) btn.closest(".error-banner")?.remove();
});

export const esc=(s)=>(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#39;"}[c]));

export const __decoder = document.createElement('textarea');
export function decodeEntities(str){ __decoder.innerHTML = str || ""; return __decoder.value; }

export function ordinalDate(iso){
  const d=new Date(iso); const day=d.getDate();
  const suf=(n)=>(n>3&&n<21)?"th":(["th","st","nd","rd"][Math.min(n%10,4)]||"th");
  return `${d.toLocaleString("en-US",{month:"long"})} ${day}${suf(day)}, ${d.getFullYear()}`;
}

export function whenImagesSettled(root, timeout = 2000){
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

export function deLazyImages(root){
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

export function transformEmbeds(root){
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

export function normalizeFirstParagraph(root){
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(node){
    const t = (node.nodeValue || "").replace(/\u00A0/g, " ").trim();
    return t ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
  }});
  const firstText = walker.nextNode(); if (!firstText) return;
  let el = firstText.parentElement;
  while (el && el !== root && el.tagName !== "P") el = el.parentElement;
  if (!el || el === root) el = root.querySelector("p");
  if (!el) return;
  el.innerHTML = el.innerHTML.replace(/^(\u00A0|&nbsp;|\s)+/i, "");
  const zeroOut = (node) => {
    node.style.setProperty("text-indent","0","important");
    node.style.setProperty("margin-left","0","important");
    node.style.setProperty("padding-left","0","important");
    node.style.setProperty("text-align","left","important");
  };
  zeroOut(el);
  let parent = el.parentElement;
  while (parent && parent !== root && !parent.classList.contains("content")) {
    const tag = (parent.tagName || "").toLowerCase();
    if (["div","section","article","blockquote","figure"].includes(tag)) zeroOut(parent);
    parent = parent.parentElement;
  }
}

export function normalizeContent(html){
  const root=document.createElement("div"); root.innerHTML=html||"";
  root.querySelectorAll("figure.wp-block-embed,.wp-block-embed__wrapper").forEach(c=>{
    if(!c.querySelector("iframe,a,img,video") && !c.textContent.trim()) c.remove();
  });
  deLazyImages(root);
  transformEmbeds(root);
  return root.innerHTML;
}

export function hardenLinks(root){
  if(!root) return;
  root.querySelectorAll("a[href]").forEach(a=>{
    const href=a.getAttribute("href")||"";
    const isInternal=href.startsWith("#/");
    if(isInternal){ a.removeAttribute("target"); a.removeAttribute("rel"); return; }
    if(/^https?:\/\//i.test(href)){ a.target="_blank"; a.rel="noopener"; }
  });
}
