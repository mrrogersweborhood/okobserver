// api.js — WordPress REST helpers via Cloudflare Worker proxy
// v2.5.4 — adds final guard to force Worker on GitHub Pages

function resolveApiBase() {
  const GH = location.hostname.endsWith('github.io');

  // Prefer the base we locked in main.js or pre-set in index.html
  let base =
    (typeof window !== 'undefined' && window.OKO_API_BASE) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('__oko_api_base_lock')) ||
    `${location.origin}/api/wp/v2`;

  // If running on GitHub Pages, FORCE Cloudflare Worker, regardless of above
  if (GH) {
    base = 'https://okobserver-proxy.bob-b5c.workers.dev/wp/v2';
  }

  // Ensure absolute and ends with /wp/v2
  if (!/^https?:\/\//i.test(base)) {
    if (base.startsWith('/')) base = `${location.origin}${base}`;
    else base = `https://${base}`;
  }
  if (!/\/wp\/v2$/i.test(base)) base = base.replace(/\/+$/,'') + '/wp/v2';

  base = base.replace(/\/+$/,'');
  console.info('[OkObserver] API_BASE in api.js:', base);
  return base;
}

export const API_BASE = resolveApiBase();
const PER_PAGE = 6;

// Small fetch with retry + JSON
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

let _cartoonId = null;
export async function getCartoonCategoryId(signal) {
  if (_cartoonId !== null) return _cartoonId;
  try {
    const url = `${API_BASE}/categories?search=cartoon&per_page=100&_fields=id,slug,name`;
    const cats = await apiFetch(url, { signal });
    const hit = Array.isArray(cats)
      ? cats.find(c => String(c.slug).toLowerCase() === 'cartoon' || String(c.name).toLowerCase() === 'cartoon')
      : null;
    _cartoonId = hit ? hit.id : 0;
  } catch {
    console.warn('[OkObserver] cartoon category lookup failed; proceeding without exclusion');
    _cartoonId = 0;
  }
  return _cartoonId;
}

export async function fetchLeanPostsPage(page = 1, { excludeCartoon = true } = {}, signal) {
  const excludeId = excludeCartoon ? await getCartoonCategoryId(signal) : 0;

  const params = new URLSearchParams({
    status: 'publish',
    per_page: String(PER_PAGE),
    page: String(page),
    _embed: '1',
    orderby: 'date',
    order: 'desc'
  });
  if (excludeId) params.set('categories_exclude', String(excludeId));

  const url = `${API_BASE}/posts?${params.toString()}`;
  const posts = await apiFetch(url, { signal });
  if (!Array.isArray(posts)) return [];
  return posts.filter(p => !(excludeId && Array.isArray(p.categories) && p.categories.includes(excludeId)));
}

export async function fetchPostById(id, signal) {
  const url = `${API_BASE}/posts/${encodeURIComponent(id)}?_embed=1`;
  return await apiFetch(url, { signal });
}

export async function fetchAuthorsMap(ids = [], signal) {
  const uniq = Array.from(new Set(ids.map(n => Number(n)).filter(Number.isFinite)));
  if (!uniq.length) return {};
  const url = `${API_BASE}/users?per_page=100&include=${uniq.join(',')}&_fields=id,name`;
  const rows = await apiFetch(url, { signal });
  const map = {};
  if (Array.isArray(rows)) for (const u of rows) map[u.id] = u.name;
  return map;
}

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
    return (
      media[0].media_details?.sizes?.medium?.source_url ||
      media[0].media_details?.sizes?.large?.source_url ||
      media[0].source_url ||
      null
    );
  }
  return null;
}

export async function resolveFeaturedImage(_post) { return null; }

export async function fetchAboutPage(slug = 'contact-about-donate', signal) {
  const url = `${API_BASE}/pages?slug=${encodeURIComponent(slug)}&_embed=1`;
  const rows = await apiFetch(url, { signal });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
