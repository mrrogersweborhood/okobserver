// api.js — OkObserver API helpers (v2.7.8)
// Ensures `_embed=1` is present so featured images/authors are available.
// Avoids over-restrictive `_fields` that can strip `_embedded`.
// Exports: apiFetch, fetchLeanPostsPage, fetchAuthorsMap, getCartoonCategoryId

// Respect the locked base set in main.js. Fallbacks are last-resort.
const API_BASE = String(
  window.OKO_API_BASE_LOCKED ||
  window.OKO_API_BASE ||
  'https://okobserver-proxy.bob-b5c.workers.dev/wp/v2'
).replace(/\/$/, '');

console.log('[OkObserver] API_BASE (api.js):', API_BASE);

// Minimal fetch wrapper with WP error surfacing
export async function apiFetch(url, opt = {}) {
  const res = await fetch(url, {
    // No-cache hints here—your Worker and SW can still cache.
    method: 'GET',
    credentials: 'omit',
    mode: 'cors',
    signal: opt.signal
  });

  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`API Error ${res.status}${body ? `: ${body}` : ''}`);
  }

  // Most WP endpoints return JSON
  return res.json();
}

// Find the “cartoon” category id (if present). Safe to fail.
export async function getCartoonCategoryId() {
  try {
    const url = `${API_BASE}/categories?search=cartoon&per_page=100&_fields=id,slug,name`;
    const cats = await apiFetch(url);
    const hit = (cats || []).find(c =>
      c?.slug === 'cartoon' || /cartoon/i.test(c?.name || '')
    );
    return hit?.id ?? null;
  } catch (e) {
    console.warn('[OkObserver] cartoon category lookup failed; proceeding without exclusion');
    return null;
  }
}

// Build a lightweight id->name map for authors (up to 100; good enough for Observer).
export async function fetchAuthorsMap() {
  try {
    const url = `${API_BASE}/users?per_page=100&_fields=id,name`;
    const users = await apiFetch(url);
    const map = {};
    (users || []).forEach(u => { if (u?.id) map[u.id] = u.name || 'The Oklahoma Observer'; });
    return map;
  } catch {
    return {};
  }
}

// Core: fetch one page of posts with FULL `_embedded` present.
export async function fetchLeanPostsPage(page = 1, perPage = 6, cartoonCategoryId = null) {
  const params = new URLSearchParams({
    status: 'publish',
    per_page: String(perPage),
    page: String(page),
    _embed: '1',
    orderby: 'date',
    order: 'desc'
  });

  // IMPORTANT: do NOT add restrictive _fields here; it can strip _embedded on some WP setups.

  if (cartoonCategoryId) {
    params.set('categories_exclude', String(cartoonCategoryId));
  }

  const url = `${API_BASE}/posts?${params.toString()}`;
  return apiFetch(url);
}
