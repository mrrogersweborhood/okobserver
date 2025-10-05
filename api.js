// api.js — WordPress REST helpers via Cloudflare Worker
// v=2.3.4 (argument-safe; featured media + author embedded)

export const PER_PAGE = 6;
export let cartoonCategoryId = null;

const ss = window.sessionStorage;
const CARTOON_KEY = "__oko_cartoon_cat_id";
const BASE_LOCK_KEY = "__oko_api_base_lock";
const cache = new Map();

function readCached(k){ try{return ss.getItem(k)||null;}catch{return null;} }
function writeCached(k,v){ try{ss.setItem(k,v);}catch{} }

export function apiBase(){
  const locked = readCached(BASE_LOCK_KEY);
  if (locked) return locked;
  if (typeof window.OKO_API_BASE === "string" && window.OKO_API_BASE) {
    return window.OKO_API_BASE.replace(/\/+$/,"");
  }
  return `${location.origin}/wp/v2`;
}
export function lockApiBaseOnce(url){
  if (url) writeCached(BASE_LOCK_KEY, url.replace(/\/+$/,""));
}

function buildUrl(base, path, params){
  const u = new URL(path.replace(/^\//,""), base + "/");
  if (params) for (const [k,v] of Object.entries(params)){
    if (v===undefined || v===null) continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function fetchJSON(url, opt={}){
  const res = await fetch(url, {
    credentials:"omit", mode:"cors", redirect:"follow",
    ...opt, headers:{ Accept:"application/json", ...(opt.headers||{}) }
  });
  if(!res.ok){
    let body=""; try{body=await res.text();}catch{}
    const err = new Error(`API Error ${res.status}${body?`: ${body.slice(0,200)}`:""}`);
    err.status=res.status; throw err;
  }
  return res.json();
}

/* ------------- Category helpers ------------- */
export async function fetchCategoryBySlug(slug="cartoon"){
  const base = apiBase();
  const url = buildUrl(base, "categories", { search: slug, per_page: 100, _fields:"id,slug,name" });
  const data = await fetchJSON(url);
  const hit = Array.isArray(data) ? data.find(c=>c.slug===slug) : null;
  return hit?.id ?? null;
}
export async function ensureCartoonCategoryId(){
  if (cartoonCategoryId) return cartoonCategoryId;
  const cached = readCached(CARTOON_KEY);
  if (cached){ cartoonCategoryId = Number(cached)||null; return cartoonCategoryId; }
  try{
    cartoonCategoryId = await fetchCategoryBySlug("cartoon");
    if (cartoonCategoryId) writeCached(CARTOON_KEY, String(cartoonCategoryId));
  }catch{ cartoonCategoryId = null; }
  return cartoonCategoryId;
}
// alias for older home.js calls
export async function getCartoonCategoryId(){ return ensureCartoonCategoryId(); }

/* ------------- Field helpers ------------- */
export function getFeaturedImage(post){
  try{
    const media = post?._embedded?.["wp:featuredmedia"]?.[0];
    const sizes = media?.media_details?.sizes || {};
    return (
      sizes?.medium_large?.source_url ||
      sizes?.large?.source_url ||
      sizes?.medium?.source_url ||
      media?.source_url || null
    );
  }catch{ return null; }
}
export function getAuthorName(post){
  try{ return post?._embedded?.author?.[0]?.name || "The Oklahoma Observer"; }
  catch{ return "The Oklahoma Observer"; }
}

/* ------------- Argument normalization ------------- */
function normPostsArgs(page, perPage, opts){
  let p = Number(page)||1;
  let pp = PER_PAGE;
  let excludeCartoon = true;
  let signal;

  if (typeof perPage === "number" && isFinite(perPage)) {
    pp = perPage;
  } else if (perPage) {
    // abort signal or options
    if (typeof perPage === "object" && "aborted" in perPage) {
      signal = perPage;
    } else if (typeof perPage === "object") {
      opts = perPage;
    }
  }
  if (opts){
    if (typeof opts.excludeCartoon === "boolean") excludeCartoon = opts.excludeCartoon;
    if (opts.signal) signal = opts.signal;
  }
  return { page:p, perPage:pp, excludeCartoon, signal };
}

/* ------------- Posts & Pages ------------- */
export async function fetchPostsPage(page=1, perPage=PER_PAGE, opts){
  const { page:p, perPage:pp, excludeCartoon, signal } = normPostsArgs(page, perPage, opts);
  const base = apiBase();
  const params = {
    status:"publish", per_page: pp, page: p, _embed:1, orderby:"date", order:"desc",
    _fields:"id,date,title.rendered,excerpt.rendered,author,featured_media,categories," +
            "_embedded.author.name,_embedded.wp:featuredmedia.source_url," +
            "_embedded.wp:featuredmedia.media_details.sizes"
  };
  if (excludeCartoon){
    const cid = await ensureCartoonCategoryId();
    if (cid) params["categories_exclude"] = cid;
  }
  const url = buildUrl(base, "posts", params);
  return fetchJSON(url, { signal });
}
export async function fetchLeanPostsPage(page=1, perPageOrSignal, opts){
  const { page:p, perPage:pp, signal } = normPostsArgs(page, perPageOrSignal, opts);
  return fetchPostsPage(p, pp, { excludeCartoon:true, signal });
}
export async function fetchPostById(id){
  const base = apiBase();
  const url = buildUrl(base, `posts/${id}`, {
    _embed:1,
    _fields:"id,date,title.rendered,content.rendered,author,featured_media,categories,"+
            "_embedded.author.name,_embedded.wp:featuredmedia.source_url,"+
            "_embedded.wp:featuredmedia.media_details.sizes"
  });
  const key = `post:${id}`;
  if (cache.has(key)) return cache.get(key);
  const data = await fetchJSON(url);
  cache.set(key, data);
  return data;
}
export async function fetchAboutPage(slugLike="contact-about-donate"){
  const base = apiBase();
  const url = buildUrl(base, "pages", { search: slugLike, per_page: 1, _fields:"title.rendered,content.rendered" });
  try{
    const arr = await fetchJSON(url);
    const hit = Array.isArray(arr) ? arr[0] : null;
    return { title: hit?.title?.rendered || "About", html: String(hit?.content?.rendered || "") };
  }catch{
    return { title:"About", html:"<p>About page unavailable.</p>" };
  }
}
