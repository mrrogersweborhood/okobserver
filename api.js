// api.js — WordPress REST calls via proxy Worker (or direct if configured)

// Base: prefer explicit worker base if set by main.js, otherwise fall back
const API_BASE =
  (typeof window !== "undefined" && window.OKO_API_BASE) ||
  `${location.origin}/wp/v2`; // e.g. https://okobserver-proxy.../wp/v2

export const PER_PAGE = 6;

// ---- tiny session cache helpers ----
const ss = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} },
};

function buildURL(path, params = {}) {
  const u = new URL(path.replace(/^\//, ""), API_BASE.endsWith("/") ? API_BASE : API_BASE + "/");
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, String(v));
  }
  return u;
}

async function fetchJSON(url, { signal } = {}) {
  const res = await fetch(url, {
    signal,
    headers: { "accept": "application/json" },
    credentials: "omit",
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = `API Error ${res.status}: ${JSON.stringify(j).slice(0, 200)}`;
    } catch {
      // ignore parse errors
    }
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Resolve the numeric category id for slug "cartoon".
 * Cached in sessionStorage to avoid repeated lookups.
 */
export async function getCartoonCategoryId(signal) {
  const CACHE_KEY = "__cat_cartoon_id";
  const cached = ss.get(CACHE_KEY);
  if (typeof cached === "number") return cached;

  const url = buildURL("categories", {
    search: "cartoon",
    per_page: 100,
    _fields: "id,slug,name",
  });

  const cats = await fetchJSON(url, { signal });
  const hit = Array.isArray(cats) ? cats.find(c => c?.slug === "cartoon") : null;
  const id = hit?.id || 0;
  ss.set(CACHE_KEY, id);
  return id;
}

/**
 * Fetch a lean page of posts for the grid (with _embed for author + media).
 * Returns an array of posts (possibly already trimmed by the Worker).
 */
export async function fetchLeanPostsPage(page = 1, signal) {
  const cartoonId = await getCartoonCategoryId(signal);
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
 * Fetch a single post with _embed=1 (detail view).
 */
export async function fetchPostById(id, signal) {
  const url = buildURL(`posts/${id}`, { _embed: 1 });
  return fetchJSON(url, { signal });
}

/**
 * Get featured image URL or fallback logo.
 */
export function getFeaturedImage(post) {
  const media = post?._embedded?.["wp:featuredmedia"]?.[0];
  return (
    media?.source_url ||
    "https://okobserver.org/wp-content/uploads/2015/09/Observer-Logo-2015-08-05.png"
  );
}

/**
 * Get author name from embedded data.
 */
export function getAuthorName(post) {
  return post?._embedded?.author?.[0]?.name || "The Oklahoma Observer";
}
