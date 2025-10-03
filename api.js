// api.js — WordPress REST API access via Cloudflare Worker proxy
// Uses _embed=1 (no _fields trimming) so authors + featured images are available.

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
    // Look up the "cartoon" category id once per session
    const url = `${API_BASE}/categories?search=cartoon&per_page=100`;
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
  // IMPORTANT: do NOT use _fields; let _embed include author + featured media
  const url =
    `${API_BASE}/posts?status=publish` +
    `&per_page=${PER_PAGE}` +
    `&page=${page}` +
    `&_embed=1` +
    `&orderby=date&order=desc`;

  const posts = await fetchJSON(url, signal);
  if (!Array.isArray(posts)) throw new Error("Unexpected API shape for posts");
  return posts;
}

/* ------------------ single post ------------------ */
export async function fetchPost(id, signal) {
  // Full payload w/ _embed for detail view
  const url = `${API_BASE}/posts/${id}?_embed=1`;
  return fetchJSON(url, signal);
}
