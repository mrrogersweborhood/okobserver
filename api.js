// api.js — WordPress REST helpers via Cloudflare Worker proxy

const LOCK_KEY = '__oko_api_base_lock';
const BASE = (() => {
  try {
    return sessionStorage.getItem(LOCK_KEY) || window.OKO_API_BASE || '/wp/v2';
  } catch {
    return window.OKO_API_BASE || '/wp/v2';
  }
})();

export const PER_PAGE = 6;

let _cartoonId = null;
export async function getCartoonCategoryId(signal){
  if (_cartoonId !== null) return _cartoonId;
  const url = `${BASE}/categories?search=cartoon&per_page=100&_fields=id,slug,name`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  const cats = await res.json();
  const hit = cats.find(c => String(c.slug).toLowerCase() === 'cartoon' || String(c.name).toLowerCase()==='cartoon');
  _cartoonId = hit ? hit.id : 0;
  return _cartoonId;
}

export async function fetchLeanPostsPage(page=1, { excludeCartoon = true } = {}, signal){
  const exclude = excludeCartoon && _cartoonId ? `&categories_exclude=${_cartoonId}` : '';
  const fields = [
    'id','date','title.rendered','excerpt.rendered','author','featured_media','categories',
    '_embedded.author.name','_embedded.wp:featuredmedia.source_url','_embedded.wp:featuredmedia.media_details.sizes',
    '_embedded.wp:term'
  ].join(',');
  const url = `${BASE}/posts?status=publish&per_page=${PER_PAGE}&page=${page}&_embed=1&orderby=date&order=desc&_fields=${encodeURIComponent(fields)}${exclude}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  return res.json();
}

export async function fetchPostById(id, signal){
  const url = `${BASE}/posts/${id}?_embed=1`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  return res.json();
}

/* ---------- Author helpers ---------- */

// Fetch a map of { id -> name } for the given user IDs.
export async function fetchAuthorsMap(ids=[], signal){
  const uniq = Array.from(new Set(ids.filter(n => Number.isFinite(n) || /^\d+$/.test(String(n))).map(Number)));
  if (uniq.length === 0) return {};
  const url = `${BASE}/users?per_page=100&include=${uniq.join(',')}&_fields=id,name`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  const rows = await res.json();
  const map = {};
  for (const u of rows) map[u.id] = u.name;
  return map;
}

// Get author name from post + optional fallback map.
export function getAuthorName(post, fallbackMap){
  const embedded = post?._embedded?.author?.[0]?.name;
  if (embedded) return embedded;
  const id = post?.author;
  if (fallbackMap && id != null && fallbackMap[id]) return fallbackMap[id];
  return 'The Oklahoma Observer';
}

/* ---------- Featured image helpers ---------- */

export function getFeaturedImage(post){
  const media = post?._embedded?.['wp:featuredmedia'];
  if (Array.isArray(media) && media[0]){
    return media[0].source_url || null;
  }
  return null;
}

export async function resolveFeaturedImage(post){
  // Already embedded? return null to avoid duplicate fetch
  const hit = getFeaturedImage(post);
  if (hit) return hit;
  // If not embedded, we avoid an extra call (the grid will simply omit the image)
  return null;
}
