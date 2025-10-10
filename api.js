export const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp/v2";
async function apiFetch(path){
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { headers:{ "accept":"application/json" } });
  if(!res.ok){
    const text = await res.text().catch(()=> "");
    throw new Error(`API Error ${res.status}: ${text}`);
  }
  return res.json();
}
export async function fetchLeanPostsPage(page=1, perPage=6){
  const query = `/posts?status=publish&per_page=${perPage}&page=${page}&_embed=1&orderby=date&order=desc`;
  return apiFetch(query);
}
export async function fetchPost(id){
  try{ return await apiFetch(`/posts/${id}?_embed=1`); }
  catch(e){
    try{ return await apiFetch(`/pages/${id}?_embed=1`); } catch{}
    try{ return await apiFetch(`/media/${id}?_embed=1`); } catch{}
    throw e;
  }
}
