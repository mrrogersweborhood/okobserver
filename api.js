// api.js — v2025-10-27a
// Optimized WP REST calls: minimal fields + trimmed _embed to slash bytes/time.
// Base proxy is your Cloudflare Worker.

const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

/*
  Helper: build a URL with query params
*/
function u(path, params = {}) {
  const url = new URL(path, API_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach(val => url.searchParams.append(k, String(val)));
    else url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/*
  getPosts: list endpoint (Home/infinite scroll)
  - Only the fields we actually render.
  - _embed trimmed to author name and featured image sizes used in UI.
*/
export async function getPosts({ page = 1, per_page = 20 } = {}) {
  const url = u('/posts', {
    page,
    per_page,
    _embed: 1,
    // IMPORTANT: only fetch exactly what we use on the cards
    _fields: [
      'id',
      'date',
      'title.rendered',
      'excerpt.rendered',
      'categories',
      'tags',
      '_embedded.wp:featuredmedia.0.id',
      '_embedded.wp:featuredmedia.0.media_details.sizes.large.source_url',
      '_embedded.wp:featuredmedia.0.media_details.sizes.medium_large.source_url',
      '_embedded.wp:featuredmedia.0.source_url',
      '_embedded.author.0.name'
    ].join(',')
  });

  const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`getPosts ${res.status}`);
  return res.json();
}

/*
  getPost: detail endpoint
  - Still trimmed, but includes full content (rendered) for the article.
  - _embed limited to author + featured image (we derive video from content).
*/
export async function getPost(id) {
  const url = u(`/posts/${id}`, {
    _embed: 1,
    _fields: [
      'id',
      'date',
      'title.rendered',
      'content.rendered',
      'categories',
      'tags',
      '_embedded.wp:term', // includes categories/tags arrays (trimmed objects)
      '_embedded.wp:featuredmedia.0.id',
      '_embedded.wp:featuredmedia.0.media_details.sizes.large.source_url',
      '_embedded.wp:featuredmedia.0.media_details.sizes.medium_large.source_url',
      '_embedded.wp:featuredmedia.0.source_url',
      '_embedded.author.0.name'
    ].join(',')
  });

  const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`getPost ${res.status}`);
  return res.json();
}

/*
  getFeaturedImage: pick the best available size we’ve asked the API for
*/
export function getFeaturedImage(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    const sizes = media?.media_details?.sizes || {};
    return (
      sizes.large?.source_url ||
      sizes.medium_large?.source_url ||
      media?.source_url ||
      ''
    );
  } catch {
    return '';
  }
}

/*
  isCartoon: filter out “cartoon” category posts (case-insensitive)
  Works with either category names in _embedded.wp:term, or falls back to slug/name match.
*/
export function isCartoon(post) {
  const terms = post?._embedded?.['wp:term'] || [];
  for (const group of terms) {
    for (const term of group || []) {
      const tax = term?.taxonomy || '';
      const name = (term?.name || term?.slug || '').toString().toLowerCase();
      if (tax === 'category' && name.includes('cartoon')) return true;
    }
  }
  return false;
}
