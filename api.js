// api.js — v2025-10-24e
// WordPress data layer for OkObserver

const BASE = 'https://okobserver.org/wp-json/wp/v2';

function withEmbed(url) {
  const u = new URL(url);
  u.searchParams.set('_embed', '1');
  return u.toString();
}

export async function getPosts({ per_page = 20, page = 1 } = {}) {
  const url = withEmbed(`${BASE}/posts?per_page=${per_page}&page=${page}&orderby=date&order=desc`);
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Posts fetch failed: ${res.status}`);
  return res.json();
}

export async function getPost(id) {
  const url = withEmbed(`${BASE}/posts/${id}`);
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Post ${id} fetch failed: ${res.status}`);
  return res.json();
}

export function extractMediaFromContent(html = '') {
  const div = document.createElement('div');
  div.innerHTML = html;
  const iframe = div.querySelector(
    'iframe[src*="youtube.com"], iframe[src*="youtu.be"], iframe[src*="vimeo.com"]'
  );
  return iframe ? iframe.getAttribute('src') : null;
}

export function getFeaturedImage(post) {
  const media = post?._embedded?.['wp:featuredmedia'];
  const m0 = Array.isArray(media) ? media[0] : null;
  const sizes = m0?.media_details?.sizes;
  return (
    sizes?.large?.source_url ||
    sizes?.medium_large?.source_url ||
    m0?.source_url ||
    null
  );
}

export function isCartoon(post) {
  const terms = post?._embedded?.['wp:term'] || [];
  const cats = terms.flat().filter(t => t.taxonomy === 'category');
  return cats.some(c => (c?.name || '').toLowerCase() === 'cartoon');
}
