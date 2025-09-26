export const APP_VERSION = "v2.0.0-mod";
window.APP_VERSION = APP_VERSION;

export const BASE = "https://okobserver.org/wp-json/wp/v2";
export const PER_PAGE = 12;
export const CACHE_VERSION = "home-v6";

export const state = (window.__okCache = window.__okCache || {
  posts: [],
  page: 1,
  totalPages: null,
  scrollY: 0,
  homeScrollY: 0,
  scrollAnchorPostId: null,
  returningFromDetail: false,
  isLoading: false,
  _loadingTicket: false,
  _ioAttached: false,
  _io: null,
  _sentinel: null,

  firstPageShown: false,
  allowNextPageAfterTs: 0,
  hasUserScrolled: false,
});

export const app = () => document.getElementById("app");

export function esc(s=""){ return s.replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

export function showError(message){
  const host = app() || document.body;
  const msg = (message && message.message) ? message.message : String(message || "Something went wrong.");
  const div = document.createElement("div");
  div.className = "error-banner";
  div.innerHTML = '<button class="close" aria-label="Dismiss">×</button>' + msg;
  host.prepend(div);
}
document.addEventListener("click",(e)=>{
  const btn = e.target.closest(".error-banner .close");
  if (btn) btn.closest(".error-banner")?.remove();
});

export function stateForSave(st){
  const { _io, _sentinel, isLoading, _loadingTicket, ...rest } = st || {};
  return rest;
}
export function saveHomeCache(){
  try{ sessionStorage.setItem("__okCache", JSON.stringify(stateForSave(state))); }catch{}
}

export function ordinalDate(iso){
  const d = new Date(iso); const day = d.getDate();
  const suf = (n) => (n>3 && n<21) ? "th" : (["th","st","nd","rd"][Math.min(n%10,4)] || "th");
  return d.toLocaleString("en-US",{month:"long"}) + " " + day + suf(day) + ", " + d.getFullYear();
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

export function nextFrame(){ return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); }

export function normalizeMediaUrl(u){
  if (!u) return u;
  try {
    u = String(u).trim();
    if (u.startsWith("//")) return "https:" + u;
    const mapping = ["okobserver.org","www.okobserver.org","okobserver.files.wordpress.com","files.wordpress.com"];
    for (const host of mapping){
      const http = "http://" + host + "/";
      const https = "https://" + host + "/";
      if (u.startsWith(http)) return u.replace(http, https);
    }
    if (u.startsWith("http://")) return "https://" + u.slice("http://".length);
    return u;
  } catch { return u; }
}

export function normalizeFirstParagraph(root){
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

export function deLazyImages(root){
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

export function transformEmbeds(root){
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

export function hardenLinks(root){
  if(!root) return;
  root.querySelectorAll('a[href]').forEach((a)=>{
    const href = a.getAttribute('href') || '';
    const isInternal = href.startsWith('#/');
    if (isInternal){ a.removeAttribute('target'); a.removeAttribute('rel'); return; }
    if (/^https?:\/\//i.test(href)){ a.target = '_blank'; a.rel = 'noopener'; }
  });
}

export const isHomeRoute = () => {
  const h = window.location.hash || "#/";
  return h === "#/" || h === "#";
};

export function clearHomeCaches(reason){
  try {
    Object.keys(sessionStorage).forEach(k => {
      if (k && k.startsWith("__home_page_")) sessionStorage.removeItem(k);
    });
    sessionStorage.removeItem("__okCache");
    sessionStorage.removeItem("__boot_seen");
    console.info("[OkObserver] Cleared home caches (" + (reason||"") + ")");
  } catch {}
}
