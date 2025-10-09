// api.js — OkObserver API helpers (v2.7.7)
// Provides: apiFetch, fetchLeanPostsPage, fetchAuthorsMap, getCartoonCategoryId
// Notes:
// - Uses your Cloudflare Worker proxy by default.
// - Adds light caching in sessionStorage to reduce repeat lookups.
// - Gracefully handles 404 on categories/users endpoints.

const DEFAULT_API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp/v2';
export const API_BASE = (typeof window !== 'undefined' && window.OKO_API_BASE) || DEFAULT_API_BASE;

/** Core fetch wrapper (JSON), throws Error on non-2xx. */
export async function apiFetch(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    // Do not send custom headers that might trigger CORS preflight
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Try to surface WP JSON error if present
    try {
      const j = JSON.parse(text);
      throw new Error(`API Error ${res.status}: ${text}`);
    } catch {
      throw new Error(`API Error ${res.status}`);
    }
  }
  return res.json();
}

/** Resolve the 'cartoon' category ID once, cache in sessionStorage. */
export async function getCartoonCategoryId() {
  const KEY = '__oko_cartoon_cat_id';
  const cached = sessionStorage.getItem(KEY);
  if (cached !== null) {
    const n = Number(cached);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  try {
    const data = await apiFetch(`/categories?search=cartoon&per_page=100&_fields=id,slug,name`);
    const hit = Array.isArray(data)
      ? data.find(c => /cartoon/i.test(c?.slug || '') || /cartoon/i.test(c?.name || ''))
      : null;
    const id = hit?.id ?? null;
    sessionStorage.setItem(KEY, id === null ? '' : String(id));
    return id;
  } catch (err) {
    console.warn('[OkObserver] cartoon category lookup failed; proceeding without exclusion');
    sessionStorage.setItem(KEY, ''); // avoid refetch loop
    return null;
  }
}

/**
 * Fetch a lean page of posts (with author name + featured sizes embedded).
 * Applies server-side category exclusion when possible, and client-side guard.
 */
export async function fetchLeanPostsPage(page = 1, perPage = 6, cartoonCategoryId = null, signal) {
  // Build fields list carefully (URL-encode ":" in _embedded.wp:featuredmedia)
  const fields = [
    'id',
    'date',
    'title.rendered',
    'excerpt.rendered',
    'author',
    'featured_media',
    'categories',
    '_embedded.author.name',
    '_embedded.wp:featuredmedia.source_url',
    '_embedded.wp:featuredmedia.media_details.sizes'
  ].join(',');

  const params = new URLSearchParams({
    status: 'publish',
    per_page: String(perPage),
    page: String(page),
    _embed: '1',
    orderby: 'date',
    order: 'desc',
    _fields: fields
  });

  if (cartoonCategoryId) {
    // Prefer server-side exclusion if we have the ID
    params.set('categories_exclude', String(cartoonCategoryId));
  }

  const path = `/posts?${params.toString()}`;
  const posts = await apiFetch(path, { signal });

  // Extra guard: if server couldn't exclude for some reason, filter client-side.
  if (cartoonCategoryId) {
    return posts.filter(p => !Array.isArray(p?.categories) || !p.categories.includes(cartoonCategoryId));
  }
  return posts;
}

/**
 * Fetch authors and return a simple { [id]: name } map.
 * Cached in sessionStorage to avoid re-fetching on every home render.
 */
export async function fetchAuthorsMap() {
  const KEY = '__oko_authors_map';
  const cached = sessionStorage.getItem(KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* fall through */ }
  }

  try {
    // Keep this light: only id + name. Proxy handles CORS.
    // If your site has many authors, bump per_page or iterate pages later.
    const users = await apiFetch(`/users?per_page=100&_fields=id,name`);
    const map = Object.create(null);
    if (Array.isArray(users)) {
      for (const u of users) {
        if (u && typeof u.id === 'number' && u.name) map[u.id] = u.name;
      }
    }
    sessionStorage.setItem(KEY, JSON.stringify(map));
    return map;
  } catch (err) {
    console.warn('[OkObserver] authors lookup failed; falling back to embedded names only');
    const empty = {};
    sessionStorage.setItem(KEY, JSON.stringify(empty));
    return empty;
  }
}
