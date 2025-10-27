// api.js — v2025-10-27c
// Fixes: restore full embedded fields (drop _fields), robust featured image picker,
// and stronger cartoon filter across list/detail responses.

const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';

/* Build URL with params */
function u(path, params = {}) {
  const url = new URL(path.replace(/^\//, ''), API_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach(val => url.searchParams.append(k, String(val)));
    else url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/* -------- Posts list (Home / infinite scroll) --------
   Note: no _fields so _embedded contains full featuredmedia sizes + term names.
*/
export async function getPosts({ page = 1, per_page = 24 } = {}) {
  const url = u('/posts', {
    page,
    per_page,
    _embed: 'author,wp:featuredmedia,wp:term'
  });
  const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error(`getPosts ${res.status}`);
  return res.json();
}

/* -------- Single post (detail) --------
   Same approach to guarantee tags/categories and media are present.
*/
export async function getPost(id) {
  const url = u(`/posts/${id}`, {
    _embed: 'author,wp:featuredmedia,wp:term'
  });
  const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error(`getPost ${res.status}`);
  return res.json();
}

/* -------- Helpers -------- */
export function getFeaturedImage(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    if (!media) return '';

    const sizes = media?.media_details?.sizes || {};
    // Try a bunch of likely size keys, then fall back to source_url
    const candidates = [
      sizes.large?.source_url,
      sizes.medium_large?.source_url,
      sizes['1536x1536']?.source_url,
      sizes['2048x2048']?.source_url,
      sizes.full?.source_url,
      media.source_url
    ];
    for (const url of candidates) {
      if (url) return url;
    }
    return '';
  } catch { return ''; }
}

/* Robust cartoon filter:
   - Checks embedded term name/slug contains 'cartoon'
   - ALSO intersects post.categories with any embedded category terms that include 'cartoon'
*/
export function isCartoon(post) {
  try {
    const termsGroups = post?._embedded?.['wp:term'] || [];
    const catIdsWithCartoon = new Set();
    let nameMatch = false;

    for (const group of termsGroups) {
      for (const term of group || []) {
        const tax = (term?.taxonomy || '').toLowerCase();
        const name = (term?.name || '').toLowerCase();
        const slug = (term?.slug || '').toLowerCase();
        const has = name.includes('cartoon') || slug.includes('cartoon');
        if (tax === 'category' && has) {
          if (typeof term.id === 'number') catIdsWithCartoon.add(term.id);
          nameMatch = true;
        }
        if (tax === 'post_tag' && has) {
          nameMatch = true;
        }
      }
    }

    // If names/slugs show cartoon anywhere, treat as cartoon.
    if (nameMatch) return true;

    // Fallback: intersect explicit category IDs
    const cats = Array.isArray(post?.categories) ? post.categories : [];
    for (const id of cats) {
      if (catIdsWithCartoon.has(id)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
