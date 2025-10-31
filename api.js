// api.js — v2025-10-30s
// Unified API utilities for OkObserver:
// - apiFetch(): timeout + retry + offline/online toast events
// - isCartoon(): filter unwanted "cartoon" category posts
// - getImageCandidates(): robust featured-image resolver
// - seedPostHint() / prefetchPost(): gentle prefetch hooks for detail view

export const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';

const TIMEOUT_MS = 7000;   // network timeout
const RETRIES    = 1;      // one retry for transient errors

function dispatch(name) {
  try { window.dispatchEvent(new CustomEvent(name)); } catch {}
}

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

/**
 * apiFetch(endpoint, init?)
 * - endpoint may be full URL or relative to API_BASE
 * - emits:
 *   - 'okobserver:api-ok'   on a successful (2xx) response
 *   - 'okobserver:api-fail' on network/timeout failure after retries
 * - DOES NOT throw on non-2xx (so caller can inspect resp.status)
 */
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
          // keep headers minimal; worker sets CORS & UA
        }),
        TIMEOUT_MS
      );

      if (resp.ok) {
        // nudge UI toast to hide if it had been shown
        dispatch('okobserver:api-ok');
      }
      return resp;
    } catch (err) {
      lastErr = err;
      // retry only for network/timeouts; loop continues
    }
  }

  // Network failure after retries → tell UI to show offline toast
  dispatch('okobserver:api-fail');
  throw lastErr || new Error('network-fail');
}

/* ------------------------------------------------------------------ */
/*  Content helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * isCartoon(post)
 * Best-effort detection via embedded category terms. Returns true if the
 * post has a category whose slug or name matches /cartoon/i.
 */
export function isCartoon(post) {
  try {
    const terms = post?._embedded?.['wp:term'];
    if (!Array.isArray(terms)) return false;

    for (const termGroup of terms) {
      if (!Array.isArray(termGroup)) continue;
      for (const t of termGroup) {
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

/**
 * getImageCandidates(post)
 * Returns the best available featured image and responsive info:
 * { src, srcset, sizes, width, height }
 *
 * Priority:
 *  1) _embedded['wp:featuredmedia'][0].media_details.sizes (large/medium_large/full)
 *  2) media.source_url
 *  3) First <img> in content/excerpt (last resort)
 */
export function getImageCandidates(post) {
  const out = { src: '', srcset: '', sizes: '100vw', width: undefined, height: undefined };

  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    if (media && (media.media_type === 'image' || (media.mime_type || '').startsWith('image/'))) {
      const sizes = media.media_details?.sizes || {};
      // Prefer medium_large/large for list grid, then full as fallback
      const pick =
        sizes.medium_large ||
        sizes.large ||
        sizes['1536x1536'] ||
        sizes['2048x2048'] ||
        sizes.full;

      if (pick?.source_url) {
        out.src = pick.source_url;
        out.width = pick.width;
        out.height = pick.height;

        // Build srcset from available sizes for better quality
        const entries = Object.values(sizes)
          .filter((s) => s?.source_url && s?.width)
          .sort((a, b) => a.width - b.width)
          .map((s) => `${s.source_url} ${s.width}w`);
        if (entries.length) out.srcset = entries.join(', ');
        // Reasonable default sizes for grid layout
        out.sizes = '(min-width:1200px) 25vw, (min-width:768px) 33vw, 100vw';
        return out;
      }

      if (media.source_url) {
        out.src = media.source_url;
        return out;
      }
    }
  } catch {}

  // Fallback: first <img> from content or excerpt
  const html = String(post?.content?.rendered || post?.excerpt?.rendered || '');
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) {
    out.src = m[1];
  }

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
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        hintCache = new Map(Object.entries(obj));
      }
    }
  } catch {}
})();

function saveHints() {
  try {
    const obj = Object.fromEntries(hintCache.entries());
    sessionStorage.setItem(HINT_KEY, JSON.stringify(obj));
  } catch {}
}

/**
 * seedPostHint(post)
 * Stores minimal info useful for warming up detail view (e.g., hero URL).
 */
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

/**
 * prefetchPost(id)
 * Soft-warm the post JSON (and tags list) into the HTTP cache. This uses
 * apiFetch (network-first with timeout). Failures are ignored.
 */
export async function prefetchPost(id) {
  try {
    await apiFetch(`posts/${encodeURIComponent(id)}?_embed=1`);
  } catch {}

  // Optionally prefetch tag metadata if we have a hint cached for this id.
  // (We don’t know tags yet without the post JSON; keep this cheap.)
  try {
    // No-op placeholder; once detail loads, tags are fetched there.
  } catch {}
}
