// api.js — OkObserver API Utilities (v2025-10-24b)

const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";

export async function fetchPosts(page = 1, perPage = 20) {
  const url = `${API_BASE}/posts?_embed&per_page=${perPage}&page=${page}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch posts: ${res.status}`);
  return res.json();
}

export async function fetchPost(id) {
  if (!id) throw new Error("fetchPost: missing post ID");
  const url = `${API_BASE}/posts/${id}?_embed`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch post ${id}: ${res.status}`);
  return res.json();
}

export function extractMedia(post) {
  const fm = post?._embedded?.["wp:featuredmedia"]?.[0];
  const src = fm?.source_url || fm?.media_details?.sizes?.medium_large?.source_url || fm?.media_details?.sizes?.large?.source_url;
  if (src) return src;

  const html = String(post?.excerpt?.rendered || post?.content?.rendered || "");
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

export function detectProviderUrlFromPost(post) {
  const html = String(post?.content?.rendered || "");
  let m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (m && /(youtube\.com|youtu\.be|vimeo\.com|facebook\.com)/i.test(m[1])) return m[1];
  m = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>.*?<\/a>/i);
  if (m && /(youtube\.com|youtu\.be|vimeo\.com|facebook\.com)/i.test(m[1])) return m[1];
  return null;
}
