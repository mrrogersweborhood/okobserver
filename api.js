// /src/lib/api.js
import { API_BASE, BUILD_VERSION } from './util.js';

function withVersion(url){
  const u = new URL(url);
  u.searchParams.set('v', BUILD_VERSION);
  return u.toString();
}

// Generic fetch with timeout and simple retry
async function fetchWithTimeout(input, { timeout = 10000, retries = 1, signal, headers } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(new DOMException('TimeoutError', 'AbortError')), timeout);

    try {
      const res = await fetch(input, {
        signal: mergeSignals(signal, ctrl.signal),
        headers
      });
      clearTimeout(tid);
      return res;
    } catch (err) {
      clearTimeout(tid);
      const isLast = attempt === retries;
      const aborted = err?.name === 'AbortError';
      if (aborted && !isLast) continue; // retry timeouts/aborts once
      if (isLast) throw err;
    }
  }
}

// Merge two AbortSignals (basic)
function mergeSignals(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  a.addEventListener('abort', onAbort);
  b.addEventListener('abort', onAbort);
  if (a.aborted || b.aborted) ctrl.abort();
  return ctrl.signal;
}

async function api(path, params = {}, { signal, timeout = 10000, retries = 1 } = {}){
  const u = new URL(API_BASE + path);
  Object.entries(params).forEach(([k,v]) => v!=null && u.searchParams.set(k, v));
  const res = await fetchWithTimeout(withVersion(u.toString()), {
    signal,
    timeout,
    retries,
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return {
    data: await res.json(),
    total: +res.headers.get('X-WP-Total') || undefined,
    totalPages: +res.headers.get('X-WP-TotalPages') || undefined
  };
}

export function getPosts({ page=1, per_page=12 } = {}, opts = {}) {
  return api('/posts', { page, per_page, _embed: 1 }, opts);
}
export function getPost(id, opts = {}) {
  return api(`/posts/${id}`, { _embed: 1 }, opts);
}
export function search(query, { page=1, per_page=12 } = {}, opts = {}) {
  return api('/search', { search: query, page, per_page }, opts);
}

export function extractMedia(post){
  const media = post?._embedded?.['wp:featuredmedia']?.[0];
  return media?.source_url || null;
}

// --- simple provider detector ---
// Expects post content HTML (post.content?.rendered) and tries to find the first media URL.
export function detectProviderUrlFromPost(post) {
  const html = post?.content?.rendered || '';
  const patterns = [
    /(https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_\-]+)/i,
    /(https?:\/\/youtu\.be\/[A-Za-z0-9_\-]+)/i,
    /(https?:\/\/(?:www\.)?vimeo\.com\/\d+)/i,
    /(https?:\/\/(?:www\.)?fa
