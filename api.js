// api.js — faster first paint + definitive category('cartoon') exclusion via WP REST
// Changes:
//  • Page-1 smaller (perPage=6) + allow HTTP cache (no bust, no cache:"reload")
//  • Defer freshness probe to idle so it doesn't block paint
//  • Keep _embed (no _fields trim) so author names are present
//  • Category-only filter (slug === "cartoon") server-side when possible + client-side guard

import { BASE, PER_PAGE, normalizeMediaUrl } from "./common.js";

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

  // SPEED: leaner page-1 and let browser reuse cache (no bust; no cache:"reload")
  const perPage = (pageNum === 1 ? 6 : PER_PAGE);
  const catParam = CARTOON_CAT_ID != null ? `&categories_exclude=${CARTOON_CAT_ID}` : "";

  const url =
    `${BASE}/posts?status=publish&per_page=${perPage}&page=${pageNum}` +
    `&_embed=1&orderby=date&order=desc` +
    `${catParam}`;

  const headers = { Accept: "application/json" };
  const opts = {
    headers, signal, mode: "cors", credentials: "omit", redirect: "follow",
    cache: (pageNum === 1 ? "default" : "default") // was "reload"
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

  // Strict category-only filter
  posts = posts.filter(p => !isCartoonCategory(p));

  // Newest-first
  posts.sort((a,b)=> new Date(b.date) - new Date(a.date));

  // Defer the freshness probe: schedule after first paint instead of blocking it
  if (pageNum === 1) {
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1200));
    idle(async () => {
      try {
        const probeUrl = `${BASE}/posts?status=publish&per_page=1&_embed=1&_fields=id,date&orderby=date&order=desc&_=${Date.now()}`;
        const probeRes = await fetch(probeUrl, { headers, mode:"cors", credentials:"omit", cache:"reload" });
        if (probeRes.ok) {
          const probe = await probeRes.json();
          const probeDate = probe?.[0]?.date ? new Date(probe[0].date).getTime() : 0;
          const page1Date = posts?.[0]?.date ? new Date(posts[0].date).getTime() : 0;
          if (probeDate && page1Date && probeDate > page1Date) {
            // silently refresh cache for next navigation; don't re-render now
            try {
              const fresh = await fetchPage(url + `&__fresh=${performance.now()}`, { ...opts, cache:"reload" });
              const filtered = (fresh.items || []).filter(p => !isCartoonCategory(p)).sort((a,b)=> new Date(b.date)-new Date(a.date));
              const mediaObj = {}; filtered.forEach(p => { const id=p.featured_media; if (id && mediaMap.has(id)) mediaObj[id] = mediaMap.get(id); });
              const authorObj = {}; filtered.forEach(p => { if (p?.author != null) authorObj[p.author] = authorMap.get(p.author) || (p?._embedded?.author?.[0]?.name || ""); });
              putHomePageCache(1, { posts: filtered, totalPages: fresh.totalPages ?? totalPages, media: mediaObj, authors: authorObj });
            } catch {}
          }
        }
      } catch {}
    });
  }

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
