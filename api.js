// api.js — WordPress API helpers via Cloudflare Worker
// Exposes: fetchLeanPostsPage(page, signal), fetchPost(id)

const BASE = (() => {
  const b = (typeof window !== "undefined" && window.OKO_API_BASE) || "";
  if (!b) console.warn("[OkObserver] OKO_API_BASE not set; API calls will fail.");
  return b.replace(/\/+$/, "");
})();

const CARTOON_CACHE_KEY = "__oko_cartoon_cat_v1";

function getCachedCartoonId() {
  try {
    const raw = sessionStorage.getItem(CARTOON_CACHE_KEY);
    if (!raw) return null;
    const { id, ts } = JSON.parse(raw);
    if (!ts || (Date.now() - ts) < 12 * 60 * 60 * 1000) return typeof id === "number" ? id : null;
  } catch {}
  return null;
}
function setCachedCartoonId(id) {
  try { sessionStorage.setItem(CARTOON_CACHE_KEY, JSON.stringify({ id, ts: Date.now() })); } catch {}
}
async function ensureCartoonCategoryId(signal) {
  const cached = getCachedCartoonId();
  if (cached !== null) return cached;

  const u = new URL(`${BASE}/categories`);
  u.searchParams.set("slug", "cartoon");
  u.searchParams.set("_fields", "id,slug");
  u.searchParams.set("per_page", "10");

  let id = null;
  try {
    const res = await fetch(u.toString(), { signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Category lookup ${res.status}`);
    const data = await res.json();
    const hit = Array.isArray(data) ? data.find(c => c?.slug === "cartoon") : null;
    id = hit?.id ?? null;
    setCachedCartoonId(id);
  } catch (e) {
    console.warn("[OkObserver] Could not fetch category 'cartoon'; client filter will be used.", e);
  }
  return id;
}

// ⬇️ IMPORTANT: no _fields here, so WordPress returns full `_embedded` (author + featured media)
function buildPostsURL(page, cartoonId) {
  const u = new URL(`${BASE}/posts`);
  u.searchParams.set("status", "publish");
  u.searchParams.set("per_page", "6");
  u.searchParams.set("page", String(page));
  u.searchParams.set("_embed", "1");
  u.searchParams.set("orderby", "date");
  u.searchParams.set("order", "desc");
  if (typeof cartoonId === "number") {
    u.searchParams.set("categories_exclude", String(cartoonId));
  }
  // small cache buster for page-1 freshness
  u.searchParams.set("__fresh", (Math.random() * 1000).toFixed(3));
  return u.toString();
}

/** Client-side safety filter: remove posts that have term slug "cartoon". */
function filterOutCartoonsClient(posts) {
  return posts.filter(p => {
    try {
      const termGroups = p?._embedded?.["wp:term"];
      if (!Array.isArray(termGroups)) return true;
      for (const group of termGroups) {
        if (!Array.isArray(group)) continue;
        if (group.some(t => (t?.slug || "").toLowerCase() === "cartoon")) return false;
      }
      return true;
    } catch { return true; }
  });
}

/** Fetch a page of posts (lightweight) with robust cartoon exclusion. */
export async function fetchLeanPostsPage(page = 1, signal) {
  const cartoonId = await ensureCartoonCategoryId(signal);
  const url = buildPostsURL(page, cartoonId);
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API Error ${res.status}`);

  const totalPages = Number(res.headers.get("X-WP-TotalPages") || 1);
  let posts = await res.json();
  if (!Array.isArray(posts)) posts = [];

  // Safety: even if server-side exclude applied, still run client filter
  const filtered = filterOutCartoonsClient(posts);

  return { posts: filtered, totalPages, fromCache: false };
}

/** Fetch a single post with embed data (keep full embed as well). */
export async function fetchPost(id, signal) {
  const u = new URL(`${BASE}/posts/${id}`);
  u.searchParams.set("_embed", "1");
  // no _fields — ensure full `_embedded` for detail, too
  const res = await fetch(u.toString(), { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  return res.json();
}
