// api.js — WordPress REST calls via your Cloudflare Worker proxy

export const PER_PAGE = 6;

// -------- sessionStorage helpers --------
const ss = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} },
};

// Resolve base **at call time** so main.js can set window.OKO_API_BASE first.
function getApiBase() {
  const base =
    (typeof window !== "undefined" && window.OKO_API_BASE) ||
    `${location.origin}/wp/v2`;
  return base.endsWith("/") ? base : `${base}/`;
}

function buildURL(path, params = {}) {
  const base = getApiBase();
  const u = new URL(path.replace(/^\//, ""), base); // e.g., .../wp/v2/ + posts
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, String(v));
  }
  return u;
}

async function fetchJSON(url, { signal } = {}) {
  const res = await fetch(url, {
    signal,
    headers: { accept: "application/json" },
    credentials: "omit",
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `API Error ${res.status}`;
    try {
      const j = await res.json();
      msg = `API Error ${res.status}: ${JSON.stringify(j).slice(0, 200)}`;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Resolve numeric category id for slug "cartoon".
 * Cached in sessionStorage to avoid repeated lookups.
 */
export async function getCartoonCategoryId(signal) {
  const KEY = "__cat_cartoon_id";
  const cached = ss.get(KEY);
  if (typeof cached === "number") return cached;

  const url = buildURL("categories", {
    search: "cartoon",
    per_page: 100,
    _fields: "id,slug,name",
  });
  const cats = await fetchJSON(url, { signal });
  const hit = Array.isArray(cats) ? cats.find(c => c?.slug === "cartoon") : null;
  const id = hit?.id || 0;
  ss.set(KEY, id);
  return id;
}

/**
 * Fetch a lean page of posts for the grid with _embed=1 (author + media).
 */
export async function fetchLeanPostsPage(page = 1, signal) {
  const cartoonId = await getCartoonCategoryId(signal).catch(() => 0);

  const url = buildURL("posts", {
    status: "publish",
    per_page: PER_PAGE,
    page,
    _embed: 1,
    orderby: "date",
    order: "desc",
    categories_exclude: cartoonId || undefined,
  });
  return fetchJSON(url, { signal });
}

/**
 * Fetch a single post (detail) with _embed=1.
 */
export async function fetchPostById(id, signal) {
  const url = buildURL(`posts/${id}`, { _embed: 1 });
  return fetchJSON(url, { signal });
}

/**
 * Helper: featured image URL with safe fallback.
 */
export function getFeaturedImage(post) {
  const media = post?._embedded?.["wp:featuredmedia"]?.[0];
  const sizes = media?.media_details?.sizes || {};
  return (
    sizes?.large?.source_url ||
    sizes?.medium_large?.source_url ||
    media?.source_url ||
    "icon.png"
  );
}

/**
 * Helper: author display name from embedded data.
 */
export function getAuthorName(post) {
  return (
    post?._embedded?.author?.[0]?.name ||
    (Array.isArray(post?.authors) && post.authors[0]?.name) ||
    ""
  );
}
