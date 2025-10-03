// api.js — REST helpers for OkObserver (WordPress via proxy)
// Exports used by home.js, detail.js, about.js.
// v=2.3.1

// ===== Public constants =====
export const PER_PAGE = 6;            // <-- added: used by home.js

// ===== Public state =====
export let cartoonCategoryId = null;

const ss = window.sessionStorage;
const CARTOON_KEY = "__oko_cartoon_cat_id";
const BASE_LOCK_KEY = "__oko_api_base_lock";
const cache = new Map(); // small in-memory cache

function readCached(key) {
  try { return ss.getItem(key) || null; } catch { return null; }
}
function writeCached(key, val) {
  try { ss.setItem(key, val); } catch {}
}

// Resolve API base at **call time** (prevents “captured too early” bugs)
export function apiBase() {
  const locked = readCached(BASE_LOCK_KEY);
  if (locked) return locked;

  if (typeof window.OKO_API_BASE === "string" && window.OKO_API_BASE) {
    return window.OKO_API_BASE.replace(/\/+$/, "");
  }
  return `${location.origin}/wp/v2`;
}

// Allow callers to pin during runtime (optional)
export function lockApiBaseOnce(url) {
  if (url) writeCached(BASE_LOCK_KEY, url.replace(/\/+$/, ""));
}

function buildUrl(base, path, params) {
  const u = new URL(path.replace(/^\//, ""), base + "/");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

async function fetchJSON(url, opt = {}) {
  const res = await fetch(url, {
    credentials: "omit",
    mode: "cors",
    redirect: "follow",
    ...opt,
    headers: {
      Accept: "application/json",
      ...(opt.headers || {}),
    },
  });
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch {}
    const err = new Error(`API Error ${res.status}${body ? `: ${body.slice(0,200)}` : ""}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/* =============== Category helpers =============== */

export async function fetchCategoryBySlug(slug = "cartoon") {
  const base = apiBase();
  const url = buildUrl(base, "categories", {
    search: slug,
    per_page: 100,
    _fields: "id,slug,name",
  });
  const data = await fetchJSON(url);
  const hit = Array.isArray(data) ? data.find((c) => c.slug === slug) : null;
  return hit?.id ?? null;
}

export async function ensureCartoonCategoryId() {
  if (cartoonCategoryId) return cartoonCategoryId;
  const cached = readCached(CARTOON_KEY);
  if (cached) {
    cartoonCategoryId = Number(cached) || null;
    return cartoonCategoryId;
  }
  try {
    cartoonCategoryId = await fetchCategoryBySlug("cartoon");
    if (cartoonCategoryId) writeCached(CARTOON_KEY, String(cartoonCategoryId));
  } catch {
    cartoonCategoryId = null; // soft-fail; client-side filter can still run
  }
  return cartoonCategoryId;
}

/* =============== Common field helpers =============== */

export function getFeaturedImage(post) {
  try {
    const media = post?._embedded?.["wp:featuredmedia"]?.[0];
    const sizes = media?.media_details?.sizes || {};
    return (
      sizes?.medium_large?.source_url ||
      sizes?.large?.source_url ||
      sizes?.medium?.source_url ||
      media?.source_url ||
      null
    );
  } catch {
    return null;
  }
}

export function getAuthorName(post) {
  try {
    return post?._embedded?.author?.[0]?.name || "The Oklahoma Observer";
  } catch {
    return "The Oklahoma Observer";
  }
}

/* =============== Posts & Pages =============== */

export async function fetchPostsPage(page = 1, perPage = PER_PAGE, { excludeCartoon = true } = {}) {
  const base = apiBase();
  const params = {
    status: "publish",
    per_page: perPage,
    page,
    _embed: 1,
    orderby: "date",
    order: "desc",
    _fields:
      "id,date,title.rendered,excerpt.rendered,author,featured_media,categories," +
      "_embedded.author.name,_embedded.wp:featuredmedia.source_url," +
      "_embedded.wp:featuredmedia.media_details.sizes",
  };

  if (excludeCartoon) {
    const cid = await ensureCartoonCategoryId();
    if (cid) params["categories_exclude"] = cid;
  }

  const url = buildUrl(base, "posts", params);
  return fetchJSON(url);
}

// Lean variant kept for compatibility
export async function fetchLeanPostsPage(page = 1, perPage = PER_PAGE) {
  return fetchPostsPage(page, perPage, { excludeCartoon: true });
}

export async function fetchPostById(id) {
  const base = apiBase();
  const url = buildUrl(base, `posts/${id}`, {
    _embed: 1,
    _fields:
      "id,date,title.rendered,content.rendered,author,featured_media,categories," +
      "_embedded.author.name,_embedded.wp:featuredmedia.source_url," +
      "_embedded.wp:featuredmedia.media_details.sizes",
  });
  const key = `post:${id}`;
  if (cache.has(key)) return cache.get(key);
  const data = await fetchJSON(url);
  cache.set(key, data);
  return data;
}

// About page content (by slug search). Returns {title, html}
export async function fetchAboutPage(slugLike = "contact-about-donate") {
  const base = apiBase();
  const url = buildUrl(base, "pages", {
    search: slugLike,
    per_page: 1,
    _fields: "title.rendered,content.rendered",
  });
  try {
    const arr = await fetchJSON(url);
    const hit = Array.isArray(arr) ? arr[0] : null;
    return {
      title: hit?.title?.rendered || "About",
      html: String(hit?.content?.rendered || ""),
    };
  } catch {
    return { title: "About", html: "<p>About page unavailable.</p>" };
  }
}
