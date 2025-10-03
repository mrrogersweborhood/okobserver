// api.js — WordPress REST API access layer for OkObserver
// v2.2.6 — Worker Proxy edition

// IMPORTANT: main.js must set window.OKO_API_BASE to your Cloudflare Worker base:
//   e.g. "https://okobserver-proxy.bob-b5c.workers.dev/wp/v2"
const API_BASE =
  (typeof window !== "undefined" && window.OKO_API_BASE) ||
  "https://okobserver-proxy.bob-b5c.workers.dev/wp/v2";

// Always a number for per_page (WordPress requires numeric)
const PER_PAGE = 6;

// Public: cartoon category id (filled lazily below)
export let cartoonCategoryId = 0;

/* --------------------------------
   Fetch helpers
----------------------------------*/
async function fetchJSON(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API Error ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

/* --------------------------------
   Category discovery (lazy)
----------------------------------*/
export async function ensureCartoonCategoryId(signal) {
  if (cartoonCategoryId) return cartoonCategoryId;
  try {
    // Search by slug/name "cartoon"
    const url = `${API_BASE}/categories?search=cartoon&per_page=100&_fields=id,slug`;
    const cats = await fetchJSON(url, signal);
    const match = Array.isArray(cats) ? cats.find((c) => c.slug === "cartoon") : null;
    cartoonCategoryId = match?.id || 0;
  } catch {
    cartoonCategoryId = 0;
  }
  return cartoonCategoryId;
}

// Fire-and-forget preload so home.js can import cartoonCategoryId immediately
// (If it loads before this resolves, the first page just won't filter by id yet,
// but your client-side slug check still protects against cartoons embedded in _embedded.wp:term.)
(async () => {
  try { await ensureCartoonCategoryId(); } catch {}
})();

/* --------------------------------
   Posts (lean for home grid)
----------------------------------*/
export async function fetchLeanPostsPage(page = 1, signal) {
  // Keep the fields tight for quicker first paint; include _embedded author, media, and terms
  const url =
    `${API_BASE}/posts?status=publish` +
    `&per_page=${PER_PAGE}` +
    `&page=${page}` +
    `&_embed=1` +
    `&orderby=date&order=desc` +
    `&_fields=` +
      [
        "id",
        "date",
        "title.rendered",
        "excerpt.rendered",
        "author",
        "featured_media",
        "categories",
        "_embedded.author.name",
        "_embedded.wp:featuredmedia.source_url",
        "_embedded.wp:featuredmedia.media_details.sizes",
        "_embedded.wp:term" // includes category terms w/ slug
      ].join(",");

  // Return raw array (home.js handles filtering, rendering, infinite scroll)
  const posts = await fetchJSON(url, signal);
  if (!Array.isArray(posts)) {
    throw new Error("Unexpected API shape for posts");
  }
  return posts;
}

/* --------------------------------
   Single post (detail page)
----------------------------------*/
export async function fetchPost(id, signal) {
  const url = `${API_BASE}/posts/${id}?_embed=1`;
  return fetchJSON(url, signal);
}
