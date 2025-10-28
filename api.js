// api.js — v2025-10-27d
// Robust fetch with automatic fallbacks when embeds are missing/trimmed.

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

/* Internal: fetch JSON with simple error surface */
async function jfetch(url, opts) {
  const res = await fetch(url, { cache: 'no-store', credentials: 'omit', ...opts });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

/* ----------------- Posts list (Home / infinite scroll) ----------------- */
export async function getPosts({ page = 1, per_page = 24 } = {}) {
  // Attempt 1: scoped embed (lean)
  const a1 = u('/posts', {
    page, per_page,
    _embed: 'author,wp:featuredmedia,wp:term'
  });

  try {
    const data = await jfetch(a1);
    if (Array.isArray(data) && data.length > 0) return data;
  } catch (e) {
    // ignore here; we have fallbacks below
    console.warn('[OkObserver] getPosts A1 failed:', e?.message || e);
  }

  // Attempt 2: full embed (widest compatibility)
  const a2 = u('/posts', { page, per_page, _embed: 1 });
  try {
    const data = await jfetch(a2);
    if (Array.isArray(data) && data.length > 0) return data;
  } catch (e) {
    console.warn('[OkObserver] getPosts A2 failed:', e?.message || e);
  }

  // Attempt 3: no embed (we’ll degrade features but still render)
  const a3 = u('/posts', { page, per_page });
  const data3 = await jfetch(a3);
  return Array.isArray(data3) ? data3 : [];
}

/* ----------------- Single post (detail) ----------------- */
export async function getPost(id) {
  // Attempt 1: scoped embed
  const p1 = u(`/posts/${id}`, { _embed: 'author,wp:featuredmedia,wp:term' });
  try {
    return await jfetch(p1);
  } catch (e) {
    console.warn('[OkObserver] getPost P1 failed:', e?.message || e);
  }

  // Attempt 2: full embed
  const p2 = u(`/posts/${id}`, { _embed: 1 });
  try {
    return await jfetch(p2);
  } catch (e) {
    console.warn('[OkObserver] getPost P2 failed:', e?.message || e);
  }

  // Attempt 3: no embed
  return jfetch(u(`/posts/${id}`));
}

/* ----------------- Helpers ----------------- */

/* Featured image:
   - Prefer embedded sizes when available
   - Fallback: use top-level featured_media → (best-effort) direct media endpoint
     NOTE: we avoid extra network calls here for speed; we only return empty
     if we truly have no URL in the post payload. */
export function getFeaturedImage(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    if (media) {
      const sizes = media?.media_details?.sizes || {};
      const candidates = [
        sizes.large?.source_url,
        sizes.medium_large?.source_url,
        sizes['1536x1536']?.source_url,
        sizes['2048x2048']?.source_url,
        sizes.full?.source_url,
        media.source_url
      ];
      for (const url of candidates) if (url) return url;
    }
    // Fallback: some installs expose a top-level image URL (rare)
    if (typeof post?.jetpack_featured_media_url === 'string') return post.jetpack_featured_media_url;
  } catch {}
  return '';
}

/* Cartoon filter:
   If taxonomy info is missing (no _embedded terms), DO NOT exclude.
   Only exclude when we positively identify a cartoon category/tag. */
export function isCartoon(post) {
  try {
    const groups = post?._embedded?.['wp:term'];
    if (!Array.isArray(groups)) return false; // no info → keep

    for (const group of groups) {
      for (const term of group || []) {
        const tax  = (term?.taxonomy || '').toLowerCase();
        const name = (term?.name || '').toLowerCase();
        const slug = (term?.slug || '').toLowerCase();
        if ((tax === 'category' || tax === 'post_tag') &&
            (name.includes('cartoon') || slug.includes('cartoon'))) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}
