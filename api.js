// api.js — v2025-10-28f
// Faster navigation to detail:
// - In-memory page cache (lists) and post cache (details)
// - NEW: lightweight "hint" cache seeded from list items for instant detail paint

const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';

// ----- in-memory caches -----
const postsPageCache = new Map();  // page -> posts[]
const postCache      = new Map();  // id -> full post
const postHint       = new Map();  // id -> partial post (from list item)

/** Public: seed a lightweight hint (from Home list item) */
export function seedPostHint(post) {
  if (!post || !post.id) return;
  // Keep just what we need for the header/hero
  const minimal = {
    id: post.id,
    date: post.date,
    title: post.title,
    excerpt: post.excerpt,
    _embedded: {
      author: post?._embedded?.author || [],
      'wp:featuredmedia': post?._embedded?.['wp:featuredmedia'] || []
    }
  };
  postHint.set(post.id, minimal);
}

/** Public: read the hint back */
export function getPostHint(id) {
  return postHint.get(Number(id));
}

function buildURL(path, params = {}, { cacheBust = false } = {}) {
  const url = new URL(path.replace(/^\//, ''), API_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach(val => url.searchParams.append(k, val));
    else url.searchParams.set(k, v);
  }
  if (cacheBust) url.searchParams.set('_t', Date.now());
  return url.toString();
}

async function jfetch(url) {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ---------------- Posts list ---------------- */
export async function getPosts({ page = 1, per_page = 12 } = {}) {
  if (postsPageCache.has(page)) return postsPageCache.get(page);

  const url = buildURL('/posts', { page, per_page, _embed: 'author,wp:featuredmedia,wp:term' }, { cacheBust: false });
  let posts;
  try {
    posts = await jfetch(url);
  } catch (e) {
    console.warn('[OkObserver] getPosts primary failed:', e);
    posts = await jfetch(buildURL('/posts', { page, per_page }, { cacheBust: false }));
  }
  if (!Array.isArray(posts)) posts = [];

  // Filter cartoons immediately (defensive)
  const filtered = posts.filter(p => !isCartoon(p));
  postsPageCache.set(page, filtered);
  return filtered;
}

/* ---------------- Single post ---------------- */
export async function getPost(id) {
  id = Number(id);
  if (postCache.has(id)) return postCache.get(id);

  let post;
  try {
    post = await jfetch(buildURL(`/posts/${id}`, { _embed: 'author,wp:featuredmedia,wp:term' }, { cacheBust: true }));
  } catch (e) {
    console.warn('[OkObserver] getPost fallback:', e);
    post = await jfetch(buildURL(`/posts/${id}`, {}, { cacheBust: true }));
  }
  postCache.set(id, post);
  return post;
}

/* -------- Image helpers (responsive) -------- */
export function getFeaturedImage(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    if (media) {
      const s = media.media_details?.sizes || {};
      const pick = s.medium_large || s.large || s.full;
      return pick?.source_url || media.source_url || '';
    }
    if (typeof post.jetpack_featured_media_url === 'string') return post.jetpack_featured_media_url;
  } catch {}
  return '';
}

export function getImageCandidates(post) {
  const out = { src: '', srcset: '', sizes: '(min-width:1100px) 60ch, 100vw', width: undefined, height: undefined };
  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    if (!media) return out;
    const s = media.media_details?.sizes || {};
    const entries = [];
    for (const key of Object.keys(s)) {
      const item = s[key];
      if (item?.source_url && typeof item.width === 'number') {
        entries.push({ w: item.width, url: item.source_url, h: item.height });
      }
    }
    if (!entries.length && media.source_url) {
      out.src = media.source_url;
      return out;
    }
    entries.sort((a,b) => a.w - b.w);
    out.srcset = entries.map(e => `${e.url} ${e.w}w`).join(', ');
    const pick = entries.find(e => e.w >= 1280) || entries[entries.length - 1] || entries[0];
    if (pick) { out.src = pick.url; out.width = pick.w; out.height = pick.h; }
    return out;
  } catch { return out; }
}

/* -------- Cartoon filter -------- */
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
