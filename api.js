// api.js — v2025-10-28h
// Detail-speed pack: in-memory caches + CORS-safe prefetch via list endpoint.

const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';

// ----- in-memory caches -----
const postsPageCache = new Map();   // page -> posts[]
const postCache      = new Map();   // id   -> full post (prefetched or fresh)
const postHint       = new Map();   // id   -> minimal post from list card
const prefetching    = new Set();   // ids currently warming (debounce)

/** Seed a lightweight hint (from Home list item) for instant paint on detail. */
export function seedPostHint(post) {
  if (!post || !post.id) return;
  const minimal = {
    id: post.id,
    date: post.date,
    title: post.title,
    excerpt: post.excerpt,
    _embedded: {
      author: post?._embedded?.author || [],
      'wp:featuredmedia': post?._embedded?.['wp:featuredmedia'] || [],
      'wp:term': post?._embedded?.['wp:term'] || []
    }
  };
  postHint.set(post.id, minimal);
}

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

/* ---------------- Posts list (Home / infinite scroll) ---------------- */
export async function getPosts({ page = 1, per_page = 12 } = {}) {
  if (postsPageCache.has(page)) return postsPageCache.get(page);

  const url = buildURL('/posts', {
    page, per_page,
    _embed: 'author,wp:featuredmedia,wp:term'
  }, { cacheBust: false });

  let posts;
  try {
    posts = await jfetch(url);
  } catch (e) {
    console.warn('[OkObserver] getPosts primary failed:', e);
    posts = await jfetch(buildURL('/posts', { page, per_page }, { cacheBust: false }));
  }

  if (!Array.isArray(posts)) posts = [];
  const filtered = posts.filter(p => !isCartoon(p));
  postsPageCache.set(page, filtered);
  return filtered;
}

/* ---------------- Post detail (standard) ----------------
   Uses cache if present; otherwise fetches fresh with cache-bust.
---------------------------------------------------------- */
export async function getPost(id) {
  id = Number(id);
  if (postCache.has(id)) return postCache.get(id);
  const post = await jfetch(buildURL(`/posts/${id}`, {
    _embed: 'author,wp:featuredmedia,wp:term'
  }, { cacheBust: true }));
  postCache.set(id, post);
  return post;
}

/* ---------------- Prefetch / Refresh ----------------
   CORS-safe prefetch: use LIST endpoint with include=<id> (proxy allows CORS here).
   Strong refresh after navigation keeps the article body fresh.
------------------------------------------------------ */

/** Warm a post in memory without triggering the proxy’s CORS issue. */
export async function prefetchPost(id) {
  id = Number(id);
  if (postCache.has(id) || prefetching.has(id)) return postCache.get(id) || null;

  prefetching.add(id);
  try {
    // NOTE: list endpoint with include=<id> returns an array with that post
    const arr = await jfetch(buildURL('/posts', {
      include: id,
      per_page: 1,
      _embed: 'author,wp:featuredmedia,wp:term'
    }, { cacheBust: false }));
    const post = Array.isArray(arr) ? arr[0] : null;
    if (post && post.id) {
      postCache.set(id, post);
      // Also seed/upgrade the hint so detail header is richer
      seedPostHint(post);
      return post;
    }
  } catch (e) {
    // swallow prefetch errors; they’re best-effort
    console.debug('[OkObserver] prefetchPost skipped:', e?.message || e);
  } finally {
    prefetching.delete(id);
  }
  return null;
}

/** After navigation, try to refresh with a cache-busting single-post call. */
export async function refreshPost(id) {
  id = Number(id);
  try {
    const fresh = await jfetch(buildURL(`/posts/${id}`, {
      _embed: 'author,wp:featuredmedia,wp:term'
    }, { cacheBust: true }));
    postCache.set(id, fresh);
    seedPostHint(fresh);
    return fresh;
  } catch {
    return postCache.get(id) || null;
  }
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
