// api.js — faster first paint + definitive category('cartoon') exclusion via WP REST
//  • Page-1 smaller (6) + allow HTTP cache
//  • Dotted _fields to keep authors/media/terms (lighter payload)
//  • If server strips _embedded with _fields, recover in idle (no regression)
//  • Category-only filter (slug === "cartoon") server-side when possible + client-side guard
//  • NEW: BASE comes from window.OKO_API_BASE (Cloudflare proxy) if present

import { PER_PAGE, normalizeMediaUrl } from "./common.js";

// Prefer the Cloudflare proxy set in main.js, else fall back to origin WP
const BASE = (typeof window !== "undefined" && window.OKO_API_BASE)
  ? window.OKO_API_BASE
  : "https://okobserver.org/wp-json/wp/v2";

export const mediaMap = new Map();
export const authorMap = new Map();

let CARTOON_CAT_ID = null;
let cartoonCatPromise = null;

async function ensureCartoonCategoryId() {
  if (CARTOON_CAT_ID != null) return CARTOON_CAT_ID;
  if (cartoonCatPromise) return cartoonCatPromise;
  cartoonCatPromise = (async () => {
    try {
      let res = await fetch(`${BASE}/categories?slug=cartoon&_fields=id,slug`, { headers:{Accept:"application/json"}, mode:"cors", credentials:"omit" });
      if (res.ok) {
        const arr = await res.json();
        const hit = Array.isArray(arr) ? arr.find(c => (c?.slug||"").toLowerCase()==="cartoon") : null;
        if (hit?.id != null) { CARTOON_CAT_ID = Number(hit.id); return CARTOON_CAT_ID; }
      }
      res = await fetch(`${BASE}/categories?search=cartoon&per_page=100&_fields=id,slug`, { headers:{Accept:"application/json"}, mode:"cors", credentials:"omit" });
      if (res.ok) {
        const arr = await res.json();
        const hit = Array.isArray(arr) ? arr.find(c => (c?.slug||"").toLowerCase()==="cartoon") : null;
        if (hit?.id != null) { CARTOON_CAT_ID = Number(hit.id); return CARTOON_CAT_ID; }
      }
      CARTOON_CAT_ID = null; return CARTOON_CAT_ID;
    } catch { CARTOON_CAT_ID = null; return CARTOON_CAT_ID; }
  })();
  return cartoonCatPromise;
}

function isCartoonCategory(post){
  try{
    const groups = post?._embedded?.["wp:term"];
    if (!Array.isArray(groups)) return false;
    for (const group of groups){
      if (!Array.isArray(group)) continue;
      for (const term of group){
        if (!term || (term.taxonomy||"").toLowerCase()!=="category") continue;
        if ((term.slug||"").toLowerCase()==="cartoon") return true;
      }
    }
  } catch {}
  return false;
}

export function mediaInfoFromSizes(m){
  if (!m) return { src:"", width:null, height:null };
  const sizes = m.media_details?.sizes || {};
  const order = ["large","medium_large","medium","thumbnail","1536x1536","2048x2048"]; // prefer smaller first for first paint
  const best = order.map(k=>sizes[k]).find(s=>s?.source_url) || null;
  return {
    src: normalizeMediaUrl(best?.source_url || m.source_url || ""),
    width: best?.width || null,
    height: best?.height || null
  };
}

export async function batchFetchMedia(ids, signal){
  const need = ids.filter(id => id && !mediaMap.has(id));
  if (!need.length) return;
  const url = `${BASE}/media?include=${need.join(",")}&per_page=${Math.max(need.length, 100)}`;
  const res = await fetch(url, { headers:{Accept:"application/json"}, signal, mode:"cors", credentials:"omit" });
  if (!res.ok) throw new Error(`Media fetch ${res.status}`);
  const items = await res.json();
  for (const m of items){ mediaMap.set(m.id, mediaInfoFromSizes(m)); }
}

const HOME_CACHE_PREFIX = "__home_page_";
const HOME_PAGE_TTL_MS = 10 * 60 * 1000;

function putHomePageCache(page, payload){
  try { const withTs = { ts: Date.now(), ...payload }; sessionStorage.setItem(HOME_CACHE_PREFIX + page, JSON.stringify(withTs)); } catch {}
}
function getHomePageCache(page){
  try {
    const raw = sessionStorage.getItem(HOME_CACHE_PREFIX + page);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj) return null;
    if (page === 1) {
      const ts = Number(obj.ts || 0);
      if (!ts || (Date.now() - ts > HOME_PAGE_TTL_MS)) return null;
    }
    const { ts, ...rest } = obj; return rest;
  } catch { return null; }
}

export async function fetchLeanPostsPage(pageNum, signal){
  if (pageNum === 1) { try { sessionStorage.removeItem("__home_page_1"); } catch {} }
  if (pageNum === 1) { try { await ensureCartoonCategoryId(); } catch {} } else { try { void ensureCartoonCategoryId(); } catch {} }

  const cached = getHomePageCache(pageNum);
  if (cached){
    if (cached.media) Object.entries(cached.media).forEach(([k,v]) => mediaMap.set(Number(k), v));
    if (cached.authors) Object.entries(cached.authors).forEach(([k,v]) => authorMap.set(Number(k), v));
    const posts = (cached.posts || []).filter(p => !isCartoonCategory(p));
    return { posts, totalPages: cached.totalPages ?? null, fromCache: true };
  }

  const perPage = (pageNum === 1 ? 6 : PER_PAGE);

  // Minimal fields that still keep _embedded author/media/terms
  const fields = [
    "id","date","title.rendered","excerpt.rendered","author","featured_media","categories",
    "_embedded.author.name",
    "_embedded.wp:featuredmedia.source_url",
    "_embedded.wp:featuredmedia.media_details.sizes",
    "_embedded.wp:term"
  ].join(",");

  const catParam = CARTOON_CAT_ID != null ? `&categories_exclude=${CARTOON_CAT_ID}` : "";

  const url =
    `${BASE}/posts?status=publish&per_page=${perPage}&page=${pageNum}` +
    `&_embed=1&orderby=date&order=desc&_fields=${encodeURIComponent(fields)}` +
    `${catParam}`;

  const headers = { Accept: "application/json" };
  const opts = {
    headers, signal, mode: "cors", credentials: "omit", redirect: "follow",
    cache: "default"
  };

  function withTimeout(promise, ms){
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Request timed out")), ms);
      promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
  }
  async function fetchPage(href, options){
    const res = await withTimeout(fetch(href, options), (pageNum === 1 ? 3500 : 7000));
    if (!res.ok){
      const text = await res.text().catch(()=> "");
      const err = new Error(`API Error ${res.status}${res.statusText?`: ${res.statusText}`:""}`);
      err.details = text?.slice(0,300);
      throw err;
    }
    const items = await res.json();
    const totalPages = Number(res.headers.get("X-WP-TotalPages")) || null;
    return { items, totalPages };
  }

  let { items: posts, totalPages } = await fetchPage(url, opts);

  // SAFETY: if _embedded was stripped, refresh in idle without _fields (don’t block paint)
  if (pageNum === 1 && posts && posts.length && !posts[0]?._embedded) {
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1200));
    idle(async () => {
      try {
        const noFieldsUrl =
          `${BASE}/posts?status=publish&per_page=6&page=1&_embed=1&orderby=date&order=desc${catParam}&__fresh=${performance.now()}`;
        const freshRes = await fetch(noFieldsUrl, { headers, mode:"cors", credentials:"omit", cache:"reload" });
        if (freshRes.ok) {
          const fresh = await freshRes.json();
          if (Array.isArray(fresh) && fresh.length) {
            const filtered = fresh.filter(p => !isCartoonCategory(p)).sort((a,b)=> new Date(b.date)-new Date(a.date));
            const mediaObj = {};
            filtered.forEach(p => {
              const m = p?._embedded?.["wp:featuredmedia"]?.[0];
              if (m){
                const sizes=m?.media_details?.sizes || {};
                const order=["large","medium_large","medium","thumbnail","1536x1536","2048x2048"];
                const best = order.map(k=>sizes[k]).find(s=>s?.source_url) || null;
                const src = normalizeMediaUrl(best?.source_url || m.source_url || "");
                if (p.featured_media && src) mediaMap.set(p.featured_media,{src,width:best?.width||null,height:best?.height||null});
                if (p.featured_media && mediaMap.has(p.featured_media)) mediaObj[p.featured_media]=mediaMap.get(p.featured_media);
              }
            });
            const authorObj = {};
            filtered.forEach(p => { if (p?.author!=null) authorObj[p.author] = p?._embedded?.author?.[0]?.name || ""; });
            putHomePageCache(1, { posts: filtered, totalPages: totalPages ?? null, media: mediaObj, authors: authorObj });
          }
        }
      } catch {}
    });
  }

  // Strict category-only filter and sort
  posts = posts.filter(p => !isCartoonCategory(p));
  posts.sort((a,b)=> new Date(b.date) - new Date(a.date));

  // Featured images + authors
  const missingMediaIds = [];
  for (const p of posts){
    const m = p?._embedded?.["wp:featuredmedia"]?.[0];
    if (m) {
      const sizes = m?.media_details?.sizes || {};
      const order = ["large","medium_large","medium","thumbnail","1536x1536","2048x2048"];
      const best = order.map(k=>sizes[k]).find(s=>s?.source_url) || null;
      const src = normalizeMediaUrl(best?.source_url || m.source_url || "");
      if (p.featured_media && src) mediaMap.set(p.featured_media, { src, width: best?.width || null, height: best?.height || null });
      else if (p.featured_media) missingMediaIds.push(p.featured_media);
    } else if (p.featured_media) missingMediaIds.push(p.featured_media);
  }
  if (missingMediaIds.length){
    try { await batchFetchMedia(Array.from(new Set(missingMediaIds)), signal); } catch {}
  }
  for (const p of posts){
    const name = p?._embedded?.author?.[0]?.name;
    if (p?.author != null && typeof name === "string") authorMap.set(p.author, name);
  }

  const mediaObj = {};
  posts.forEach(p => { const id=p.featured_media; if (id && mediaMap.has(id)) mediaObj[id] = mediaMap.get(id); });
  const authorObj = {};
  posts.forEach(p => { if (p?.author != null) authorObj[p.author] = authorMap.get(p.author) || (p?._embedded?.author?.[0]?.name || ""); });

  putHomePageCache(pageNum, { posts, totalPages, media: mediaObj, authors: authorObj });
  return { posts, totalPages, fromCache: false };
}

export async function fetchPost(id, signal){
  const res = await fetch(`${BASE}/posts/${id}?_embed=1`, { headers:{Accept:"application/json"}, signal, mode:"cors", credentials:"omit" });
  if (!res.ok) throw new Error('Post not found');
  return res.json();
}

export async function fetchAboutPage(signal){
  const res = await fetch(`${BASE}/pages?slug=contact-about-donate&_embed=1`, { headers:{Accept:"application/json"}, signal, mode:"cors", credentials:"omit" });
  if (!res.ok) throw new Error(`About page not available (${res.status})`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : null;
}
