// api.js — v2025-10-28c
// CORS-safe fetches (no disallowed headers), always-fresh via _t cache-buster.

const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';

/* Build URL with params and add a cache-busting _t token */
function u(path, params = {}) {
  const url = new URL(path.replace(/^\//, ''), API_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach(val => url.searchParams.append(k, val));
    else url.searchParams.set(k, v);
  }
  url.searchParams.set('_t', Date.now());
  return url.toString();
}

/* Safe JSON fetch: NO custom headers, NO cache hints (avoid CORS preflight) */
async function jfetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    mode: 'cors',
    credentials: 'omit'
    // Don't set cache/no-store; it triggers Cache-Control request header
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* Posts list (Home / infinite scroll) */
export async function getPosts({ page = 1, per_page = 24 } = {}) {
  const url = u('/posts', { page, per_page, _embed: 'author,wp:featuredmedia,wp:term' });

  let posts = [];
  try { posts = await jfetch(url); }
  catch (e) {
    console.warn('[OkObserver] getPosts primary failed:', e);
    posts = await jfetch(u('/posts', { page, per_page }));
  }

  if (!Array.isArray(posts)) return [];
  return posts.filter(p => !isCartoon(p));
}

/* Single post (detail) */
export async function getPost(id) {
  try {
    return await jfetch(u(`/posts/${id}`, { _embed: 'author,wp:featuredmedia,wp:term' }));
  } catch (e) {
    console.warn('[OkObserver] getPost fallback:', e);
    return await jfetch(u(`/posts/${id}`));
  }
}

/* Helpers */
export function getFeaturedImage(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    if (media) {
      const s = media.media_details?.sizes || {};
      const pick = s.large || s.medium_large || s.full;
      return pick?.source_url || media.source_url || '';
    }
    if (typeof post.jetpack_featured_media_url === 'string') return post.jetpack_featured_media_url;
  } catch {}
  return '';
}

export function isCartoon(post) {
  try {
    const groups = post?._embedded?.['wp:term'];
    if (!Array.isArray(groups)) return false;
    for (const group of groups) {
      for (const term of group || []) {
        const name = (term.name || '').toLowerCase();
        const slug = (term.slug || '').toLowerCase();
        if (name.includes('cartoon') || slug.includes('cartoon')) return true;
      }
    }
  } catch {}
  return false;
}
