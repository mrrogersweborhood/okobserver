// api.js — OkObserver API Utilities (v2025-10-24a)
// Fetch helpers + media utilities used by Home and PostDetail.

const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";

/** Fetch a page of posts with _embed data */
export async function fetchPosts(page = 1, perPage = 20) {
  const url = `${API_BASE}/posts?_embed&per_page=${perPage}&page=${page}`;
  console.log("[OkObserver API] Fetching posts:", url);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch posts: ${res.status}`);
  return res.json();
}

/** Fetch a single post with _embed data */
export async function fetchPost(id) {
  if (!id) throw new Error("fetchPost: missing post ID");
  const url = `${API_BASE}/posts/${id}?_embed`;
  console.log("[OkObserver API] Fetching post:", url);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch post ${id}: ${res.status}`);
  return res.json();
}

/** Get a usable poster image URL for a post (featured image or first <img> in content) */
export function extractMedia(post) {
  // 1) Featured media via _embedded
  const fm = post?._embedded?.["wp:featuredmedia"]?.[0];
  const src = fm?.source_url || fm?.media_details?.sizes?.medium_large?.source_url || fm?.media_details?.sizes?.large?.source_url;
  if (src) return src;

  // 2) First <img> src in rendered content
  const html = String(post?.excerpt?.rendered || post?.content?.rendered || "");
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) return m[1];

  return null;
}

/** Find a known video provider URL inside a post (YouTube/Vimeo/Facebook) */
export function detectProviderUrlFromPost(post) {
  const html = String(post?.content?.rendered || "");
  // try iframes first
  let m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (m) {
    const u = m[1];
    if (/(youtube\.com|youtu\.be|vimeo\.com|facebook\.com)/i.test(u)) return u;
  }
  // then links
  m = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>(?:[^<]*)<\/a>/i);
  if (m && /(youtube\.com|youtu\.be|vimeo\.com|facebook\.com)/i.test(m[1])) {
    return m[1];
  }
  return null;
}
