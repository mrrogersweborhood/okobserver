// api.js — handles all WordPress REST API fetches
// Compatible with main.js v2.4.4 and Cloudflare Worker proxy
// v2.4.4

const API_BASE =
  window.OKO_API_BASE ||
  sessionStorage.getItem('__oko_api_base_lock') ||
  `${location.origin}/api/wp/v2`;

let cartoonCategoryId = null;

// Utility: simple GET with retry + JSON parse
async function apiFetch(url, opts = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        ...opts,
      });
      if (!res.ok) throw new Error(`API Error ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
}

// Ensure cartoon category id is known
export async function getCartoonCategoryId(signal) {
  if (cartoonCategoryId) return cartoonCategoryId;
  try {
    const url = `${API_BASE}/categories?search=cartoon&per_page=100&_fields=id,slug,name`;
    const cats = await apiFetch(url, { signal });
    const match = cats.find(
      (c) => c.slug.toLowerCase() === 'cartoon' || c.name.toLowerCase() === 'cartoon'
    );
    if (match) cartoonCategoryId = match.id;
    return cartoonCategoryId;
  } catch (e) {
    console.warn('[OkObserver] Could not fetch cartoon category id:', e);
    return null;
  }
}

// Fetch one page of posts
export async function fetchLeanPostsPage(page = 1, signal) {
  const exclude = await getCartoonCategoryId(signal);
  const url = new URL(`${API_BASE}/posts`);
  url.search = new URLSearchParams({
    status: 'publish',
    per_page: 6,
    page,
    _embed: 1,
    orderby: 'date',
    order: 'desc',
    _fields:
      'id,date,title.rendered,excerpt.rendered,author,featured_media,categories,_embedded.author.name,_embedded.wp:featuredmedia.source_url,_embedded.wp:featuredmedia.media_details.sizes,_embedded.wp:term',
    ...(exclude ? { categories_exclude: exclude } : {}),
  }).toString();

  const posts = await apiFetch(url, { signal });
  if (!Array.isArray(posts)) return [];

  return posts.filter(
    (p) =>
      !p.categories?.includes(exclude) &&
      !/cartoon/i.test(p.title.rendered) &&
      !/cartoon/i.test(p.excerpt.rendered)
  );
}

// Fetch single post with embeds
export async function fetchPostDetail(id, signal) {
  const url = `${API_BASE}/posts/${id}?_embed=1`;
  return await apiFetch(url, { signal });
}

// Fetch page (for About or similar)
export async function fetchAboutPage(slug = 'contact-about-donate', signal) {
  const url = `${API_BASE}/pages?slug=${slug}&_embed=1`;
  const res = await apiFetch(url, { signal });
  return res && res.length ? res[0] : null;
}

// Export base for debugging and other modules
export { API_BASE };
