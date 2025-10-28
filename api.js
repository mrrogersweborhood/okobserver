// 🟢 api.js — v2025-10-28a
// Always-fresh fetch with aggressive no-cache and server-side cartoon filtering.

const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';

/* ---------------- URL builder ---------------- */
function u(path, params = {}) {
  const url = new URL(path.replace(/^\//, ''), API_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach(val => url.searchParams.append(k, val));
    else url.searchParams.set(k, v);
  }
  // Bust any Cloudflare edge cache
  url.searchParams.set('_t', Date.now());
  return url.toString();
}

/* ---------------- Safe JSON fetch ---------------- */
async function jfetch(url, opts) {
  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    mode: 'cors',
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    ...opts
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ---------------- Posts list ---------------- */
export async function getPosts({ page = 1, per_page = 24 } = {}) {
  const q = { page, per_page, _embed: 'author,wp:featuredmedia,wp:term' };
  const url = u('/posts', q);

  let posts = [];
  try { posts = await jfetch(url); }
  catch (e) {
    console.warn('[OkObserver] getPosts primary failed:', e);
    // fallback minimal mode
    posts = await jfetch(u('/posts', { page, per_page }));
  }

  if (!Array.isArray(posts)) return [];

  // Filter out cartoons immediately
  return posts.filter(p => !isCartoon(p));
}

/* ---------------- Single post ---------------- */
export async function getPost(id) {
  const url = u(`/posts/${id}`, { _embed: 'author,wp:featuredmedia,wp:term' });
  try {
    return await jfetch(url);
  } catch (e) {
    console.warn('[OkObserver] getPost fallback:', e);
    return await jfetch(u(`/posts/${id}`));
  }
}

/* ---------------- Helpers ---------------- */
export function getFeaturedImage(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    if (media) {
      const s = media.media_details?.sizes || {};
      const pick = s.large || s.medium_large || s.full;
      return pick?.source_url || media.source_url || '';
    }
    if (typeof post.jetpack_featured_media_url === 'string')
      return post.jetpack_featured_media_url;
  } catch {}
  return '';
}

export function isCartoon(post) {
  try {
    const groups = post?._embedded?.['wp:term'];
    if (!Array.isArray(groups)) return false;
    for (const group of groups)
      for (const term of group || []) {
        const name = (term.name || '').toLowerCase();
        const slug = (term.slug || '').toLowerCase();
        if (name.includes('cartoon') || slug.includes('cartoon')) return true;
      }
  } catch {}
  return false;
}
