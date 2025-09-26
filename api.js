import { BASE, PER_PAGE, normalizeMediaUrl } from "./common.js";

export const mediaMap = new Map();   // id -> { src, width, height }
export const authorMap = new Map();  // id -> name

export const CARTOON_SLUG = "cartoon";

export function isCartoonByEmbedded(p){
  const groups = p?._embedded?.["wp:term"];
  if (!Array.isArray(groups)) return false;
  for (const group of groups){
    if (!Array.isArray(group)) continue;
    for (const term of group){
      if (term && term.taxonomy === 'category' && term.slug === CARTOON_SLUG) return true;
    }
  }
  return false;
}

export function mediaInfoFromSizes(m){
  if (!m) return { src:"", width:null, height:null };
  const sizes = m.media_details?.sizes || {};
  const order = ["2048x2048","1536x1536","large","medium_large","medium","thumbnail"];
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
  const res = await fetch(url, { headers:{Accept:"application/json"}, signal, mode:"cors", credentials:"omit", redirect:"follow" });
  if (!res.ok) throw new Error(`Media fetch ${res.status}`);
  const items = await res.json();
  for (const m of items){ mediaMap.set(m.id, mediaInfoFromSizes(m)); }
}

const HOME_CACHE_PREFIX = "__home_page_";
const HOME_PAGE_TTL_MS = 10 * 60 * 1000;

function putHomePageCache(page, payload){
  try { const withTs = { ts: Date.now(), ...payload };
    sessionStorage.setItem(HOME_CACHE_PREFIX + page, JSON.stringify(withTs)); } catch {}
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
    const { ts, ...rest } = obj;
    return rest;
  } catch { return null; }
}

export async function fetchLeanPostsPage(pageNum, signal){
  if (pageNum === 1) { try { sessionStorage.removeItem("__home_page_1"); } catch {} }

  const cached = getHomePageCache(pageNum);
  if (cached){
    if (cached.media) Object.entries(cached.media).forEach(([k,v]) => mediaMap.set(Number(k), v));
    if (cached.authors) Object.entries(cached.authors).forEach(([k,v]) => authorMap.set(Number(k), v));
    return { posts: cached.posts || [], totalPages: cached.totalPages ?? null, fromCache: true };
  }

  const bust = `&_=${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const url = `${BASE}/posts?status=publish&per_page=${PER_PAGE}&page=${pageNum}&_embed=1&orderby=date&order=desc${bust}`;

  const headers = { Accept: "application/json" };
  const opts = {
    headers,
    signal,
    mode: "cors",
    credentials: "omit",
    redirect: "follow",
    cache: (pageNum === 1 ? "reload" : "default"),
  };

  async function fetchPage(href, options){
    const res = await fetch(href, options);
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

  posts.sort((a,b)=> new Date(b.date) - new Date(a.date));
  if (posts[0]?.date) console.info("[OkObserver] Page", pageNum, "newest:", posts[0].date);

  if (pageNum === 1) {
    try {
      const probeUrl = `${BASE}/posts?status=publish&per_page=1&_fields=id,date&orderby=date&order=desc&_=${Date.now()}`;
      const probeRes = await fetch(probeUrl, { headers, signal, mode:"cors", credentials:"omit", redirect:"follow", cache:"reload" });
      if (probeRes.ok) {
        const probe = await probeRes.json();
        const probeDate = probe?.[0]?.date ? new Date(probe[0].date).getTime() : 0;
        const page1Date = posts?.[0]?.date ? new Date(posts[0].date).getTime() : 0;
        if (probeDate && page1Date && probeDate > page1Date) {
          const hardUrl = url + `&__fresh=${performance.now()}`;
          const fresh = await fetchPage(hardUrl, { ...opts, cache:"reload" });
          fresh.items.sort((a,b)=> new Date(b.date) - new Date(a.date));
          posts = fresh.items;
          totalPages = fresh.totalPages;
          console.info("[OkObserver] Page 1 refreshed via probe; newest:", posts[0]?.date);
        }
      }
    } catch (e) {
      console.warn("[OkObserver] Probe failed; using first result.", e);
    }
  }

  posts = posts.filter(p => !isCartoonByEmbedded(p));

  const mediaIds = Array.from(new Set(posts.map(p=>p.featured_media).filter(Boolean)));
  await Promise.allSettled([ batchFetchMedia(mediaIds, signal) ]);

  for (const p of posts){
    const name = p?._embedded?.author?.[0]?.name;
    if (p?.author != null && typeof name === "string") authorMap.set(p.author, name);
  }

  const mediaObj = {}; mediaIds.forEach(id => { const v = mediaMap.get(id); if (v) mediaObj[id] = v; });
  const authorObj = {}; posts.forEach(p => { if (p?.author != null) authorObj[p.author] = authorMap.get(p.author) || ""; });

  putHomePageCache(pageNum, { posts, totalPages, media: mediaObj, authors: authorObj });
  return { posts, totalPages, fromCache: false };
}

export async function fetchPost(id, signal){
  const res = await fetch(`${BASE}/posts/${id}?_embed=1`, { headers:{Accept:"application/json"}, signal, mode:"cors", credentials:"omit", redirect:"follow" });
  if (!res.ok) throw new Error('Post not found');
  return res.json();
}

export async function fetchAboutPage(signal){
  const res = await fetch(`${BASE}/pages?slug=contact-about-donate&_embed=1`, { headers:{Accept:"application/json"}, signal, mode:"cors", credentials:"omit", redirect:"follow" });
  if (!res.ok) throw new Error(`About page not available (${res.status})`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : null;
}
