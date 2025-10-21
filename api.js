import { API_BASE, BUILD_VERSION } from './util.js';

function withVersion(url){
  const u = new URL(url);
  u.searchParams.set('v', BUILD_VERSION);
  return u.toString();
}

async function api(path, params={}, { signal }={}){
  const u = new URL(API_BASE + path);
  Object.entries(params).forEach(([k,v]) => v!=null && u.searchParams.set(k, v));
  const res = await fetch(withVersion(u.toString()), { signal, headers: { 'Accept': 'application/json' }});
  if (!res.ok) throw new Error(`API ${res.status}`);
  return { data: await res.json(), total: +res.headers.get('X-WP-Total') || undefined, totalPages: +res.headers.get('X-WP-TotalPages') || undefined };
}

export function getPosts({ page=1, per_page=12 }={}, opts={}){ return api('/posts', { page, per_page, _embed: 1 }, opts); }
export function getPost(id, opts={}){ return api(`/posts/${id}`, { _embed: 1 }, opts); }
export function search(query, { page=1, per_page=12 }={}, opts={}){ return api('/search', { search: query, page, per_page }, opts); }

export function extractMedia(post){
  const media = post?._embedded?.['wp:featuredmedia']?.[0];
  return media?.source_url || null;
}
