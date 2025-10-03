// api.js — WordPress REST API access layer for OkObserver
// Cleaned up to fix per_page bug

const API_BASE = window.OKO_API_BASE || "https://okobserver.org/wp-json/wp/v2";

// Always use a number, not a string, for per_page
const PER_PAGE = 6;

// Simple fetch wrapper with error handling
async function fetchJSON(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API Error ${res.status}: ${text}`);
  }
  return await res.json();
}

// Fetch one page of posts (lean fields for home grid)
export async function fetchLeanPostsPage(page = 1, signal) {
  const url =
    `${API_BASE}/posts?status=publish` +
    `&per_page=${PER_PAGE}` +
    `&page=${page}` +
    `&_embed=1` +
    `&orderby=date&order=desc` +
    `&_fields=id,date,title.rendered,excerpt.rendered,author,featured_media,categories,_embedded.author.name,_embedded.wp:featuredmedia.source_url,_embedded.wp:featuredmedia.media_details.sizes,_embedded.wp:term`;

  const posts = await fetchJSON(url, signal);

  // Determine if more pages exist from response headers
  let hasMore = false;
  try {
    const totalPages = parseInt(
      (await fetch(url, { method: "HEAD", signal })).headers.get("X-WP-TotalPages"),
      10
    );
    hasMore = page < totalPages;
  } catch {
    // If HEAD fails, assume true until fetch fails
    hasMore = posts.length === PER_PAGE;
  }

  return { posts, hasMore };
}

// Fetch full post content for detail page
export async function fetchPost(id, signal) {
  const url = `${API_BASE}/posts/${id}?_embed=1`;
  return await fetchJSON(url, signal);
}

// Cache cartoon category id (so we can filter them)
let cartoonCatId = 0;

export async function ensureCartoonCategoryId(signal) {
  if (cartoonCatId) return cartoonCatId;
  try {
    const url = `${API_BASE}/categories?search=cartoon&per_page=100&_fields=id,slug`;
    const cats = await fetchJSON(url, signal);
    const c = cats.find((c) => c.slug === "cartoon");
    cartoonCatId = c?.id || 0;
  } catch {
    cartoonCatId = 0;
  }
  return cartoonCatId;
}
