// api.js — OkObserver WP API helpers
// v2.5.5

// --- BASE selection & helpers ----------------------------------------------
const WORKER_DEFAULT = 'https://okobserver-proxy.bob-b5c.workers.dev/wp/v2';
const ORIGIN_HINT = (typeof window !== 'undefined' && window.OKO_API_BASE) ? window.OKO_API_BASE : '';

export const API_BASE = (()=>{
  // Prefer the Worker (CORS-friendly). If a page set OKO_API_BASE, use that.
  try {
    const u = new URL(ORIGIN_HINT || WORKER_DEFAULT);
    // Force path to /wp/v2 no matter what
    const parts = u.pathname.replace(/\/+$/,'').split('/');
    const last2 = parts.slice(-2).join('/');
    if (last2 !== 'wp/v2') u.pathname = '/wp/v2';
    return u.origin + u.pathname;
  } catch {
    return WORKER_DEFAULT;
  }
})();

function makeURL(path, params) {
  const u = new URL(path, API_BASE.endsWith('/') ? API_BASE : API_BASE + '/');
  if (params) {
    Object.entries(params).forEach(([k,v])=>{
      if (v === undefined || v === null) return;
      u.searchParams.set(k, String(v));
    });
  }
  return u.toString();
}

export class ApiError extends Error {
  constructor(status, body) {
    super(`API Error ${status}`); this.status = status; this.body = body;
  }
}

export async function apiFetch(url, {signal} = {}) {
  const res = await fetch(url, {signal});
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch {}
    throw new ApiError(res.status, body);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

// --- Category helpers -------------------------------------------------------
let CARTOON_ID_CACHE = null;

/** Looks up the 'cartoon' category id (once). Non-fatal if missing. */
export async function getCartoonCategoryId({signal} = {}) {
  if (CARTOON_ID_CACHE !== null) return CARTOON_ID_CACHE;
  try {
    const url = makeURL('categories', {
      search: 'cartoon', per_page: 100, _fields: 'id,slug,name'
    });
    const list = await apiFetch(url, {signal});
    const hit = Array.isArray(list) ? list.find(c => (c.slug || '').toLowerCase() === 'cartoon') : null;
    CARTOON_ID_CACHE = hit ? hit.id : 0;
    return CARTOON_ID_CACHE;
  } catch (e) {
    console.warn('[OkObserver] cartoon category lookup failed; proceeding without exclusion');
    CARTOON_ID_CACHE = 0;
    return 0;
  }
}

// --- Posts (list) -----------------------------------------------------------
/** Lean list for the home grid. */
export async function fetchLeanPostsPage(page = 1, {excludeCategoryId = 0, signal} = {}) {
  const params = {
    status: 'publish',
    per_page: 6,
    page,
    _embed: 1,
    orderby: 'date',
    order: 'desc',
    _fields: [
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
    ].join(',')
  };
  if (excludeCategoryId) params.categories_exclude = excludeCategoryId;

  const url = makeURL('posts', params);
  return apiFetch(url, {signal}); // array
}

// --- Post (detail) ----------------------------------------------------------
/** Robust detail fetch: always /posts/{id}?_embed=1 */
export async function fetchPostById(id, {signal} = {}) {
  const safe = String(id || '').match(/\d+/)?.[0];
  if (!safe) throw new Error('Invalid post id');

  const url = makeURL(`posts/${safe}`, { _embed: 1 });
  const data = await apiFetch(url, {signal}); // object
  return data;
}

// --- Media helper (optional) -----------------------------------------------
export function pickFeaturedImage(post) {
  // Prefer _embedded sizes; fallback to source_url
  const em = post?._embedded?.['wp:featuredmedia'];
  if (Array.isArray(em) && em[0]) {
    const sizes = em[0]?.media_details?.sizes || {};
    // try common sizes in descending preference
    const order = ['large', 'medium_large', 'medium', 'full', 'thumbnail'];
    for (const k of order) {
      const s = sizes[k];
      if (s?.source_url) return s.source_url;
    }
    if (em[0]?.source_url) return em[0].source_url;
  }
  return '';
}
