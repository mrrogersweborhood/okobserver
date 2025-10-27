// api.js — v2025-10-27b
// Safer field trimming: only top-level _fields + scoped _embed types.
// No nested _fields paths (prevents 400s on some WP installs).

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

/* -------- Posts list (Home / infinite scroll) -------- */
export async function getPosts({ page = 1, per_page = 24 } = {}) {
  // Request only top-level fields we render + scoped embed
  const url = u('/posts', {
    page,
    per_page,
    _embed: 'author,wp:featuredmedia,wp:term',
    _fields: 'id,date,title,excerpt,categories,tags,_embedded'
  });

  let res = await fetch(url, { cache: 'no-store', credentials: 'omit' });

  // Fallback: if server still objects, retry without _fields (last resort)
  if (!res.ok && res.status === 400) {
    console.warn('[OkObserver] getPosts 400 with _fields; retrying without _fields');
    const url2 = u('/posts', {
      page, per_page,
      _embed: 'author,wp:featuredmedia,wp:term'
    });
    res = await fetch(url2, { cache: 'no-store', credentials: 'omit' });
  }

  if (!res.ok) throw new Error(`getPosts ${res.status}`);
  return res.json();
}

/* -------- Single post (detail) -------- */
export async function getPost(id) {
  const url = u(`/posts/${id}`, {
    _embed: 'author,wp:featuredmedia,wp:term',
    _fields: 'id,date,title,content,categories,tags,_embedded'
  });

  let res = await fetch(url, { cache: 'no-store', credentials: 'omit' });

  if (!res.ok && res.status === 400) {
    console.warn('[OkObserver] getPost 400 with _fields; retrying without _fields');
    const url2 = u(`/posts/${id}`, {
      _embed: 'author,wp:featuredmedia,wp:term'
    });
    res = await fetch(url2, { cache: 'no-store', credentials: 'omit' });
  }

  if (!res.ok) throw new Error(`getPost ${res.status}`);
  return res.json();
}

/* -------- Helpers -------- */
export function getFeaturedImage(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    const sizes = media?.media_details?.sizes || {};
    return (
      sizes?.large?.source_url ||
      sizes?.medium_large?.source_url ||
      media?.source_url || ''
    );
  } catch { return ''; }
}

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
