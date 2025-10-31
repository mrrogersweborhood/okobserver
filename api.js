// api.js — v2025-10-31a (resilient fetch + retry + offline dispatch)

export const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';
const TIMEOUT_MS = 12000;    // give Cloudflare / WP time
const RETRIES    = 1;        // one retry after timeout

function dispatch(name) {
  try { window.dispatchEvent(new CustomEvent(name)); } catch {}
}

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

export async function apiFetch(endpoint, init = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  let lastErr;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const resp = await withTimeout(
        fetch(url, {
          ...init,
          credentials: 'omit',
          cache: 'no-store',
        }),
        TIMEOUT_MS
      );

      if (resp.ok) {
        dispatch('okobserver:api-ok');
      }
      return resp;
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES) await new Promise(r => setTimeout(r, 500));
    }
  }

  dispatch('okobserver:api-fail');
  throw lastErr || new Error('network-fail');
}

/* ------------------------------------------------------------------ */
/*  Content helpers                                                    */
/* ------------------------------------------------------------------ */

export function isCartoon(post) {
  try {
    const terms = post?._embedded?.['wp:term'];
    if (!Array.isArray(terms)) return false;
    for (const group of terms) {
      if (!Array.isArray(group)) continue;
      for (const t of group) {
        const tax = (t?.taxonomy || '').toLowerCase();
        if (tax !== 'category') continue;
        const slug = (t?.slug || '').toLowerCase();
        const name = (t?.name || '').toLowerCase();
        if (slug.includes('cartoon') || name.includes('cartoon')) return true;
      }
    }
  } catch {}
  return false;
}

export function getImageCandidates(post) {
  const out = { src: '', srcset: '', sizes: '100vw', width: undefined, height: undefined };
  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    if (media && (media.media_type === 'image' || (media.mime_type || '').startsWith('image/'))) {
      const sizes = media.media_details?.sizes || {};
      const pick =
        sizes.medium_large || sizes.large || sizes.full ||
        sizes['1536x1536'] || sizes['2048x2048'];
      if (pick?.source_url) {
        out.src = pick.source_url;
        out.width = pick.width;
        out.height = pick.height;
        const entries = Object.values(sizes)
          .filter(s => s?.source_url && s?.width)
          .sort((a,b)=>a.width-b.width)
          .map(s => `${s.source_url} ${s.width}w`);
        if (entries.length) out.srcset = entries.join(', ');
        out.sizes = '(min-width:1200px) 25vw, (min-width:768px) 33vw, 100vw';
        return out;
      }
      if (media.source_url) out.src = media.source_url;
    }
  } catch {}
  const html = String(post?.content?.rendered || post?.excerpt?.rendered || '');
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) out.src = m[1];
  return out;
}

/* ------------------------------------------------------------------ */
/*  Prefetch hints                                                     */
/* ------------------------------------------------------------------ */

const HINT_KEY = 'okobserver.post.hints.v1';
let hintCache = new Map();

(function loadHints() {
  try {
    const raw = sessionStorage.getItem(HINT_KEY);
    if (raw) hintCache = new Map(Object.entries(JSON.parse(raw)));
  } catch {}
})();
function saveHints() {
  try {
    sessionStorage.setItem(HINT_KEY, JSON.stringify(Object.fromEntries(hintCache.entries())));
  } catch {}
}

export function seedPostHint(post) {
  try {
    if (!post?.id) return;
    const img = getImageCandidates(post);
    if (img.src) {
      hintCache.set(String(post.id), { hero: img.src });
      saveHints();
    }
  } catch {}
}

export async function prefetchPost(id) {
  try { await apiFetch(`posts/${encodeURIComponent(id)}?_embed=1`); } catch {}
}
