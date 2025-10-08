// api.js — WordPress REST helpers via Cloudflare Worker proxy
// v2.4.5 (exports match detail.js + home.js)

const API_BASE =
  window.OKO_API_BASE ||
  sessionStorage.getItem('__oko_api_base_lock') ||
  `${location.origin}/api/wp/v2`;

const PER_PAGE = 6; // internal default

// ---- tiny fetch w/ retry ----
async function apiFetch(url, opts = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, ...opts });
      if (!res.ok) throw new Error(`API Error ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 350 * (i + 1)));
    }
  }
}

// ---- cartoon category (for exclusion) ----
let _cartoonId = null;
export async function getCartoonCategoryId(signal) {
  if (_cartoonId !== null) return _cartoonId;
  try {
    const url = `${API_BASE}/categories?search=cartoon&per_page=100&_fields=id,slug,name`;
    const cats = await apiFetch(url, { signal });
    const hit = Array.isArray(cats)
      ? cats.find(c => String(c.slug).toLowerCase() === 'cartoon' || String(c.name).toLowerCase() === 'cartoon')
      : null;
    _cartoonId = hit ? hit.id : 0; // 0 = not found; harmless
  } catch (e) {
    console.warn('[OkObserver] cartoon category lookup failed; proceeding without exclusion', e);
    _cartoonId = 0;
  }
  return _cartoonId;
}

// ---- posts (lean list) ----
export async function fetchLeanPostsPage(page = 1, { excludeCartoon = true } = {}, signal) {
  const excludeId = excludeCartoon ? await getCartoonCategoryId(signal) : 0;

  const fields = [
    'id','date','title.rendered','excerpt.rendered','author','featured_media','categories',
    '_embedded.author.name',
    '_embedded.wp:featuredmedia.source_url',
    '_embedded.wp:featuredmedia.media_details.sizes',
    '_embedded.wp:term'
  ].join(',');

  const params = new URLSearchParams({
    status: 'publish',
    per_page: String(PER_PAGE),
    page: String(page),
    _embed: '1',
    orderby: 'date',
    order: 'desc',
    _fields: fields
  });
  if (excludeId) params.set('categories_exclude', String(excludeId));

  const url = `${API_BASE}/posts?${params.toString()}`;
  const posts = await apiFetch(url, { signal });

  if (!Array.isArray(posts)) return [];
  // extra belt+suspenders filter client-side
  return posts.filter(p => !(excludeId && Array.isArray(p.categories) && p.categories.includes(excludeId)));
}

// ---- single post (detail) ----
export async function fetchPostById(id, signal) {
  const url = `${API_BASE}/posts/${encodeURIComponent(id)}?_embed=1`;
  return await apiFetch(url, { signal });
}

// ---- authors (fallback map) ----
export async function fetchAuthorsMap(ids = [], signal) {
  const uniq = Array.from(new Set(ids.map(n => Number(n)).filter(n => Number.isFinite(n))));
  if (!uniq.length) return {};
  const url = `${API_BASE}/users?per_page=100&include=${uniq.join(',')}&_fields=id,name`;
  const rows = await apiFetch(url, { signal });
  const map = {};
  if (Array.isArray(rows)) for (const u of rows) map[u.id] = u.name;
  return map;
}

// ---- helpers for embedded data ----
export function getAuthorName(post, fallbackMap) {
  const embedded = post?._embedded?.author?.[0]?.name;
  if (embedded) return embedded;
  const id = post?.author;
  if (fallbackMap && id != null && fallbackMap[id]) return fallbackMap[id];
  return 'The Oklahoma Observer';
}

export function getFeaturedImage(post) {
  const media = post?._embedded?.['wp:featuredmedia'];
  if (Array.isArray(media) && media[0]) {
    return media[0].media_details?.sizes?.medium?.source_url || media[0].source_url || null;
  }
  return null;
}

export async function resolveFeaturedImage(_post) {
  // We already request _embed=1; avoid extra fetch to prevent flicker.
  return null;
}

// ---- about page (optional) ----
export async function fetchAboutPage(slug = 'contact-about-donate', signal) {
  const url = `${API_BASE}/pages?slug=${encodeURIComponent(slug)}&_embed=1`;
  const rows = await apiFetch(url, { signal });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// Export base for debugging
export { API_BASE };
