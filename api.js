// api.js — OkObserver API helper (final verified version)

const WORKER_DEFAULT = 'https://okobserver-proxy.bob-b5c.workers.dev/wp/v2';
export const API_BASE = WORKER_DEFAULT;

// Generic fetch wrapper
export async function apiFetch(url, { signal } = {}) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

// URL builder
function makeURL(path, params) {
  const u = new URL(path, API_BASE.endsWith('/') ? API_BASE : API_BASE + '/');
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) u.searchParams.set(k, v);
    }
  }
  return u.toString();
}

// Category lookup (cartoon filter)
let CARTOON_ID_CACHE = null;
export async function getCartoonCategoryId({ signal } = {}) {
  if (CARTOON_ID_CACHE !== null) return CARTOON_ID_CACHE;
  try {
    const url = makeURL('categories', { search: 'cartoon', per_page: 100, _fields: 'id,slug,name' });
    const list = await apiFetch(url, { signal });
    const hit = Array.isArray(list) ? list.find(c => (c.slug || '').toLowerCase() === 'cartoon') : null;
    CARTOON_ID_CACHE = hit ? hit.id : 0;
  } catch {
    CARTOON_ID_CACHE = 0;
  }
  return CARTOON_ID_CACHE;
}

// ✅ AUTHORS MAP (this fixes your error)
let AUTHORS_CACHE = null;
export async function fetchAuthorsMap({ signal } = {}) {
  if (AUTHORS_CACHE) return AUTHORS_CACHE;
  const url = makeURL('users', { per_page: 100, _fields: 'id,name' });
  const list = await apiFetch(url, { signal });
  const map = new Map();
  if (Array.isArray(list)) {
    for (const u of list) {
      if (u?.id) map.set(u.id, u.name || '—');
    }
  }
  AUTHORS_CACHE = map;
  return map;
}

// Posts list
export async function fetchLeanPostsPage(page = 1, { excludeCategoryId = 0, signal } = {}) {
  const params = {
    status: 'publish',
    per_page: 6,
    page,
    _embed: 1,
    orderby: 'date',
    order: 'desc'
  };
  if (excludeCategoryId) params.categories_exclude = excludeCategoryId;
  const url = makeURL('posts', params);
  return apiFetch(url, { signal });
}

// Single post detail
export async function fetchPostById(id, { signal } = {}) {
  const safe = String(id || '').match(/\d+/)?.[0];
  if (!safe) throw new Error('Invalid post id');
  const url = makeURL(`posts/${safe}`, { _embed: 1 });
  return apiFetch(url, { signal });
}

// Featured image helper
export function pickFeaturedImage(post) {
  const em = post?._embedded?.['wp:featuredmedia'];
  if (Array.isArray(em) && em[0]) {
    const sizes = em[0]?.media_details?.sizes || {};
    const order = ['large', 'medium_large', 'medium', 'full', 'thumbnail'];
    for (const k of order) {
      const s = sizes[k];
      if (s?.source_url) return s.source_url;
    }
    if (em[0]?.source_url) return em[0].source_url;
  }
  return '';
}
