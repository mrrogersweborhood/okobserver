// api.js — definitive category('cartoon') exclusion using WordPress REST API
// FIX: Do NOT trim response with `_fields=...` so `_embedded.author` remains intact (author names show).
// - Resolves the category ID for slug "cartoon" via /wp/v2/categories
// - Excludes server-side with categories_exclude=<ID> when available
// - Also filters client-side strictly where category term slug === "cartoon"
// - Keeps authors/images via _embedded, soft timeout, lean page-1, and cache re-filter

import { BASE, PER_PAGE, normalizeMediaUrl } from "./common.js";

export const mediaMap = new Map();   // id -> { src, width, height }
export const authorMap = new Map();  // id -> name

// --- Resolved category ID for slug "cartoon" (filled once, reused) ---
let CARTOON_CAT_ID = null;
let cartoonCatPromise = null;

/**
 * Resolve the category ID for slug "cartoon".
 * Uses a decoupled fetch (no AbortController signal) to avoid AbortError noise.
 * If the slug is not found or network fails, we proceed with client-side filtering only.
 */
async function ensureCartoonCategoryId() {
  if (CARTOON_CAT_ID != null) return CARTOON_CAT_ID;
  if (cartoonCatPromise) return cartoonCatPromise;

  cartoonCatPromise = (async () => {
    try {
      // Try direct slug lookup first
      let url = `${BASE}/categories?slug=cartoon&_fields=id,slug`;
      let res = await fetch(url, {
        headers: { Accept: "application/json" },
        mode: "cors",
        credentials: "omit",
        redirect: "follow",
        cache: "default",
      });
      if (res.ok) {
        const arr = await res.json();
        const hit = Array.isArray(arr) ? arr.find(c => (c?.slug || "").toLowerCase() === "cartoon") : null;
        if (hit?.id != null) {
          CARTOON_CAT_ID = Number(hit.id);
          console.info("[OkObserver] Resolved 'cartoon' category ID:", CARTOON_CAT_ID);
          return CARTOON_CAT_ID;
        }
      }

      // Fallback: broad search then confirm slug
      url = `${BASE}/categories?search=cartoon&per_page=100&_fields=id,slug`;
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        mode: "cors",
        credentials: "omit",
        redirect: "follow",
        cache: "default",
      });
      if (res.ok) {
        const arr = await res.json();
        const hit = Array.isArray(arr) ? arr.find(c => (c?.slug || "").toLowerCase() === "cartoon") : null;
        if (hit?.id != null) {
          CARTOON_CAT_ID = Number(hit.id);
          console.info("[OkObserver] Resolved 'cartoon' category ID (fallback):", CARTOON_CAT_ID);
          return CARTOON_CAT_ID;
        }
      }

      // Not found or blocked; client-side filter will handle it
      CARTOON_CAT_ID = null;
      console.info("[OkObserver] 'cartoon' category ID not resolved; client-side filter will handle it.");
      return CARTOON_CAT_ID;
    } catch {
      // Network/CORS issues — just proceed with client-side filter.
      CARTOON_CAT_ID = null;
      console.info("[OkObserver] Category ID resolve skipped; using client filter only.");
      return CARTOON_CAT_ID;
    }
  })();

  return cartoonCatPromise;
}

/** Strict category-only guard: exclude when a CATEGORY term has slug === "cartoon" */
function isCartoonCategory(post) {
  try {
    const groups = post?._embedded?.["wp:term"];
    if (!Array.isArray(groups)) return false;
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      for (const term of group) {
        if (!term) continue;
        if ((term.taxonomy || "").toLowerCase() !== "category") continue;
        const slug = (term.slug || "").toLowerCase();
        if (slug === "cartoon") return true;
      }
    }
  } catch {}
  return false;
}

export function mediaInfoFromSizes(m) {
  if (!m) return { src: "", width: null, height: null };
  const sizes = m.media_details?.sizes || {};
  const order = ["2048x2048", "1536x1536", "large", "medium_large", "medium", "thumbnail"];
  const best = order.map(k => sizes[k]).find(s => s?.source_url) || null;
  return {
    src: normalizeMediaUrl(best?.source_url || m.source_url || ""),
    width: best?.width || null,
    height: best?.height || null,
  };
}

export async function batchFetchMedia(ids, signal) {
  const need = ids.filter(id => id && !mediaMap.has(id));
  if (!need.length) return;
  const url = `${BASE}/media?include=${need.join(",")}&per_page=${Math.max(need.length, 100)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal, mode: "cors", credentials: "omit", redirect: "follow" });
  if (!res.ok) throw new Error(`Media fetch ${res.status}`);
  const items = await res.json();
  for (const m of items) {
    mediaMap.set(m.id, mediaInfoFromSizes(m));
  }
}

const HOME_CACHE_PREFIX = "__home_page_";
const HOME_PAGE_TTL_MS = 10 * 60 * 1000;

function putHomePageCache(page, payload) {
  try {
    const withTs = { ts: Date.now(), ...payload };
    sessionStorage.setItem(HOME_CACHE_PREFIX + page, JSON.stringify(withTs));
  } catch {}
}
function getHomePageCache(page) {
  try {
    const raw = sessionStorage.getItem(HOME_CACHE_PREFIX + page);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj) return null;
    if (page === 1) {
      const ts = Number(obj.ts || 0);
      if (!ts || Date.now() - ts > HOME_PAGE_TTL_MS) return null;
    }
    const { ts, ...rest } = obj;
    return rest;
  } catch {
    return null;
  }
}

export async function fetchLeanPostsPage(pageNum, signal) {
  if (pageNum === 1) {
    try { sessionStorage.removeItem("__home_page_1"); } catch {}
  }

  // Kick off category ID resolution (non-blocking except page-1 we prefer to await)
  if (pageNum === 1) { try { await ensureCartoonCategoryId(); } catch {} }
  else { try { void ensureCartoonCategoryId(); } catch {} }

  const cached = getHomePageCache(pageNum);
  if (cached) {
    if (cached.media) Object.entries(cached.media).forEach(([k, v]) => mediaMap.set(Number(k), v));
    if (cached.authors) Object.entries(cached.authors).forEach(([k, v]) => authorMap.set(Number(k), v));
    const posts = (cached.posts || []).filter(p => !isCartoonCategory(p)); // re-filter cached with strict category check
    return { posts, totalPages: cached.totalPages ?? null, fromCache: true };
  }

  // Smaller page-1 for faster first paint
  const perPage = pageNum === 1 ? 9 : PER_PAGE;

  // If we resolved the cartoon category ID, exclude it server-side
  const catParam = CARTOON_CAT_ID != null ? `&categories_exclude=${CARTOON_CAT_ID}` : "";

  const bust = `&_=${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const url =
    `${BASE}/posts?status=publish&per_page=${perPage}&page=${pageNum}` +
    `&_embed=1&orderby=date&order=desc` +               // <-- NO _fields param now
    `${catParam}${bust}`;

  const headers = { Accept: "application/json" };
  const opts = {
    headers,
    signal,
    mode: "cors",
    credentials: "omit",
    redirect: "follow",
    cache: pageNum === 1 ? "reload" : "default",
  };

  // Soft timeout so we don’t hang forever on a slow origin
  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Request timed out")), ms);
      promise.then(
        v => { clearTimeout(t); resolve(v); },
        e => { clearTimeout(t); reject(e); }
      );
    });
  }

  async function fetchPage(href, options) {
    const res = await withTimeout(fetch(href, options), pageNum === 1 ? 4000 : 7000);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`API Error ${res.status}${res.statusText ? `: ${res.statusText}` : ""}`);
      err.details = text?.slice(0, 300);
      throw err;
    }
    const items = await res.json();
    const totalPages = Number(res.headers.get("X-WP-TotalPages")) || null;
    return { items, totalPages };
  }

  let { items: posts, totalPages } = await fetchPage(url, opts);

  // Strict client-side filter (belt & suspenders)
  posts = posts.filter(p => !isCartoonCategory(p));

  // Newest-first
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (posts[0]?.date) console.info("[OkObserver] Page", pageNum, "newest:", posts[0].date);

  // Probe most-recent to ensure page-1 is fresh
  if (pageNum === 1) {
    try {
      const probeUrl = `${BASE}/posts?status=publish&per_page=1&_embed=1&_fields=id,date&orderby=date&order=desc&_=${Date.now()}`;
      const probeRes = await fetch(probeUrl, {
        headers,
        signal,
        mode: "cors",
        credentials: "omit",
        redirect: "follow",
        cache: "reload",
      });
      if (probeRes.ok) {
        const probe = await probeRes.json();
        const probeDate = probe?.[0]?.date ? new Date(probe[0].date).getTime() : 0;
        const page1Date = posts?.[0]?.date ? new Date(posts[0].date).getTime() : 0;
        if (probeDate && page1Date && probeDate > page1Date) {
          const hardUrl = url + `&__fresh=${performance.now()}`;
          const fresh = await fetchPage(hardUrl, { ...opts, cache: "reload" });
          const refreshed = fresh.items.filter(p => !isCartoonCategory(p));
          refreshed.sort((a, b) => new Date(b.date) - new Date(a.date));
          posts = refreshed;
          totalPages = fresh.totalPages;
          console.info("[OkObserver] Page 1 refreshed via probe; newest:", posts[0]?.date);
        }
      }
    } catch {
      console.warn("[OkObserver] Probe failed; using first result.");
    }
  }

  // Featured images from embedded; fallback /media if missing
  const missingMediaIds = [];
  for (const p of posts) {
    const m = p?._embedded?.["wp:featuredmedia"]?.[0];
    if (m) {
      const sizes = m?.media_details?.sizes || {};
      const order = ["2048x2048", "1536x1536", "large", "medium_large", "medium", "thumbnail"];
      const best = order.map(k => sizes[k]).find(s => s?.source_url) || null;
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
  if (missingMediaIds.length) {
    try { await batchFetchMedia(Array.from(new Set(missingMediaIds)), signal); } catch {}
  }

  // Author names from embedded (now present because we didn't _fields-trim the post response)
  for (const p of posts) {
    const name = p?._embedded?.author?.[0]?.name;
    if (p?.author != null && typeof name === "string") authorMap.set(p.author, name);
  }

  // Cache the page
  const mediaObj = {};
  posts.forEach(p => {
    const id = p.featured_media;
    if (id && mediaMap.has(id)) mediaObj[id] = mediaMap.get(id);
  });
  const authorObj = {};
  posts.forEach(p => {
    if (p?.author != null) authorObj[p.author] = authorMap.get(p.author) || "";
  });

  putHomePageCache(pageNum, { posts, totalPages, media: mediaObj, authors: authorObj });
  return { posts, totalPages, fromCache: false };
}

export async function fetchPost(id, signal) {
  const res = await fetch(`${BASE}/posts/${id}?_embed=1`, {
    headers: { Accept: "application/json" },
    signal,
    mode: "cors",
    credentials: "omit",
    redirect: "follow",
  });
  if (!res.ok) throw new Error("Post not found");
  return res.json();
}

export async function fetchAboutPage(signal) {
  const res = await fetch(`${BASE}/pages?slug=contact-about-donate&_embed=1`, {
    headers: { Accept: "application/json" },
    signal,
    mode: "cors",
    credentials: "omit",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`About page not available (${res.status})`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : null;
}
