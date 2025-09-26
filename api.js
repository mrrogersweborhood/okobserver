// api.js — FINAL: server-side excludes for cartoon categories/tags + client fallback filter + HARD DENYLIST
// also: authors/images via _embedded, soft timeout, lean page-1, cache re-filter
import { BASE, PER_PAGE, normalizeMediaUrl } from "./common.js";

export const mediaMap = new Map();   // id -> { src, width, height }
export const authorMap = new Map();  // id -> name

// --- Hard denylist for specific post IDs that must never show ---
const HARDBAN_POST_IDS = new Set([
  380985, // user-reported cartoon that leaked
]);

// --- Exclusion ID caches (filled once, reused) ---
let EXCLUDED_CAT_IDS = [];
let EXCLUDED_TAG_IDS = [];
let exclusionsReady = false;
let exclusionsPromise = null;

// Resolve category/tag IDs containing "cartoon" (slug or name)
async function primeExclusions(signal){
  if (exclusionsReady) return;
  if (exclusionsPromise) return exclusionsPromise;

  async function fetchAll(endpoint){
    const url = `${BASE}/${endpoint}?search=cartoon&per_page=100&_fields=id,slug,name`;
    const res = await fetch(url, { headers:{Accept:"application/json"}, signal, mode:"cors", credentials:"omit", redirect:"follow", cache:"reload" });
    if (!res.ok) return [];
    return res.json();
  }

  exclusionsPromise = (async()=>{
    try {
      const [cats, tags] = await Promise.all([
        fetchAll("categories"),
        fetchAll("tags"),
      ]);

      const match = (t) => {
        const slug = (t?.slug || "").toLowerCase();
        const name = (t?.name || "").toLowerCase();
        return slug.includes("cartoon") || name.includes("cartoon");
      };

      EXCLUDED_CAT_IDS = (Array.isArray(cats) ? cats.filter(match).map(x=>x.id) : []).filter(Boolean);
      EXCLUDED_TAG_IDS = (Array.isArray(tags) ? tags.filter(match).map(x=>x.id) : []).filter(Boolean);

      exclusionsReady = true;
      console.info("[OkObserver] Exclusions:", { categories: EXCLUDED_CAT_IDS, tags: EXCLUDED_TAG_IDS });
    } catch (e) {
      // If anything fails, fall back to client-side filtering only
      console.warn("[OkObserver] Could not fetch exclusion IDs; will rely on client filter.", e);
      exclusionsReady = true;
    }
  })();

  return exclusionsPromise;
}

// Robust cartoon check: hard denylist OR permalink path OR any term (category/tag) contains "cartoon"
function isCartoon(p){
  try {
    if (!p) return false;

    if (HARDBAN_POST_IDS.has(Number(p.id))) return true;

    const link = (p.link || "").toLowerCase();
    if (link.includes("/cartoon/") || link.includes("/cartoons/")) return true;

    const groups = p?._embedded?.["wp:term"];
    if (Array.isArray(groups)) {
      for (const group of groups){
        if (!Array.isArray(group)) continue;
        for (const term of group){
          const tax  = (term?.taxonomy || "").toLowerCase();
          const slug = (term?.slug || "").toLowerCase();
          const name = (term?.name || "").toLowerCase();
          if ((tax === "category" || tax === "post_tag") &&
              (slug.includes("cartoon") || name.includes("cartoon"))) {
            return true;
          }
        }
      }
    }
  } catch {/* ignore */}
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

  // Ensure server-side exclusion IDs are primed (no-op if already done)
  try { await primeExclusions(signal); } catch {}

  const cached = getHomePageCache(pageNum);
  if (cached){
    if (cached.media) Object.entries(cached.media).forEach(([k,v]) => mediaMap.set(Number(k), v));
    if (cached.authors) Object.entries(cached.authors).forEach(([k,v]) => authorMap.set(Number(k), v));
    const posts = (cached.posts || []).filter(p => !isCartoon(p)); // re-filter cached
    return { posts, totalPages: cached.totalPages ?? null, fromCache: true };
  }

  // Smaller page-1 for faster first paint
  const perPage = (pageNum === 1 ? 9 : PER_PAGE);

  // Keep _embedded whole (compat for authors/media), and include link for permalink filtering
  const fields = [
    "id","date","title.rendered","excerpt.rendered","author","featured_media",
    "link",
    "_embedded"
  ].join(",");

  // Build exclusion params if we discovered any
  const catParam = EXCLUDED_CAT_IDS.length ? `&categories_exclude=${EXCLUDED_CAT_IDS.join(",")}` : "";
  const tagParam = EXCLUDED_TAG_IDS.length ? `&tags_exclude=${EXCLUDED_TAG_IDS.join(",")}` : "";

  const bust = `&_=${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const url =
    `${BASE}/posts?status=publish&per_page=${perPage}&page=${pageNum}` +
    `&_embed=1&orderby=date&order=desc&_fields=${encodeURIComponent(fields)}` +
    `${catParam}${tagParam}${bust}`;

  const headers = { Accept: "application/json" };
  const opts = {
    headers,
    signal,
    mode: "cors",
    credentials: "omit",
    redirect: "follow",
    cache: (pageNum === 1 ? "reload" : "default"),
  };

  // Soft timeout so we don’t hang forever on a slow origin
  function withTimeout(promise, ms){
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Request timed out")), ms);
      promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
  }

  async function fetchPage(href, options){
    const res = await withTimeout(fetch(href, options), (pageNum === 1 ? 4000 : 7000));
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

  // Newest-first
  posts.sort((a,b)=> new Date(b.date) - new Date(a.date));
  if (posts[0]?.date) console.info("[OkObserver] Page", pageNum, "newest:", posts[0].date);

  // Probe most-recent to ensure page-1 is fresh
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

  // Belt-and-suspenders filter (hard denylist + terms + permalink)
  posts = posts.filter(p => !isCartoon(p));

  // Featured images from embedded; fallback /media if missing
  const missingMediaIds = [];
  for (const p of posts){
    const m = p?._embedded?.["wp:featuredmedia"]?.[0];
    if (m) {
      const sizes = m?.media_details?.sizes || {};
      const order = ["2048x2048","1536x1536","large","medium_large","medium","thumbnail"];
      const best = order.map(k=>sizes[k]).find(s=>s?.source_url) || null;
      const src = normalizeMediaUrl(best?.source_url || m.source_url || "");
      if (p.featured_media && src) {
        mediaMap.set(p.featured_media, { src, width: best?.width || null, height: best?.height || null });
      } else if (p.featured_media) {
        missingMediaIds.push(p.featured_media);
      }
    } else if (p.featured_media) {
      missingMediaIds.push(p.featured_media);
    }
  }
  if (missingMediaIds.length){
    try { await batchFetchMedia(Array.from(new Set(missingMediaIds)), signal); } catch {}
  }

  // Author names from embedded
  for (const p of posts){
    const name = p?._embedded?.author?.[0]?.name;
    if (p?.author != null && typeof name === "string") authorMap.set(p.author, name);
  }

  // Cache the page
  const mediaObj = {};
  posts.forEach(p => { const id=p.featured_media; if (id && mediaMap.has(id)) mediaObj[id] = mediaMap.get(id); });
  const authorObj = {};
  posts.forEach(p => { if (p?.author != null) authorObj[p.author] = authorMap.get(p.author) || ""; });

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
