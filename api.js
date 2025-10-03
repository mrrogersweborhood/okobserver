// api.js — WordPress REST API access via Cloudflare Worker proxy
// Exports only functions (no mutable named exports)

const API_BASE =
  (typeof window !== "undefined" && window.OKO_API_BASE) ||
  "https://okobserver-proxy.bob-b5c.workers.dev/wp/v2";

const PER_PAGE = 6;

/* ------------------ helpers ------------------ */
async function fetchJSON(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API Error ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

/* ------------- cartoon category -------------- */
let _cartoonId = null;

export async function getCartoonCategoryId(signal) {
  if (_cartoonId !== null) return _cartoonId;
  try {
    const url = `${API_BASE}/categories?search=cartoon&per_page=100&_fields=id,slug`;
    const cats = await fetchJSON(url, signal);
    const match = Array.isArray(cats) ? cats.find((c) => c.slug === "cartoon") : null;
    _cartoonId = match?.id || 0;
  } catch {
    _cartoonId = 0;
  }
  return _cartoonId;
}

/* ------------------- posts ------------------- */
export async function fetchLeanPostsPage(page = 1, signal) {
  // IMPORTANT: include `_embedded` *itself* in _fields.
  const fields =
    "_embedded," + [
      "id",
      "date",
      "title.rendered",
      "excerpt.rendered",
      "author",
      "featured_media",
      "categories",
      // nested convenience (kept for clarity; WP ignores unknown paths if _embedded present)
      "_embedded.author.name",
      "_embedded.wp:featuredmedia.source_url",
      "_embedded.wp:featuredmedia.media_details.sizes",
      "_embedded.wp:term"
    ].join(",");

  const url =
    `${API_BASE}/posts?status=publish` +
    `&per_page=${PER_PAGE}` +
    `&page=${page}` +
    `&_embed=1` +
    `&orderby=date&order=desc` +
    `&_fields=${fields}`; // do NOT encode, WP expects comma-separated list

  const posts = await fetchJSON(url, signal);
  if (!Array.isArray(posts)) throw new Error("Unexpected API shape for posts");
  return posts;
}

/* ------------------ single post ------------------ */
export async function fetchPost(id, signal) {
  // Keep it simple for detail: allow full response with _embed
  const url = `${API_BASE}/posts/${id}?_embed=1`;
  return fetchJSON(url, signal);
}
