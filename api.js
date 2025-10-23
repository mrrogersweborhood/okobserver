// api.js — OkObserver API Utilities (v2025-10-23b)
// Handles fetching posts and single post details from the WordPress proxy API

const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";

// Fetch all posts with embed data
export async function fetchPosts(page = 1, perPage = 20) {
  const url = `${API_BASE}/posts?_embed&per_page=${perPage}&page=${page}`;
  console.log("[OkObserver API] Fetching posts:", url);

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch posts: ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("[OkObserver API] Error fetching posts:", err);
    throw err;
  }
}

// Fetch a single post by ID with embed data
export async function fetchPost(id) {
  if (!id) throw new Error("fetchPost: missing post ID");
  const url = `${API_BASE}/posts/${id}?_embed`;
  console.log("[OkObserver API] Fetching post:", url);

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch post ${id}: ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("[OkObserver API] Error fetching post:", err);
    throw err;
  }
}
