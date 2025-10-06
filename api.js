// api.js — WordPress REST helpers via Cloudflare Worker
// v=2.3.7 (featured image network fallback + safe args)

export const PER_PAGE = 6;
export let cartoonCategoryId = null;

const ss = window.sessionStorage;
const CARTOON_KEY = "__oko_cartoon_cat_id";
const BASE_LOCK_KEY = "__oko_api_base_lock";
const mem = new Map();

/* ---------------- Base URL ---------------- */
function read(k){ try{return ss.getItem(k)||null;}catch{return null;} }
function write(k,v){ try{ss.setItem(k,v);}catch{} }

export function apiBase(){
  const locked = read(BASE_LOCK_KEY);
  if (locked) return locked;
  if (typeof window.OKO_API_BASE === "string" && window.OKO_API_BASE) {
    return window.OKO_API_BASE.replace(/\/+$/, "");
  }
  return `${location.origin}/wp/v2`;
}
export function lockApiBaseOnce(url){
  if (url) write(BASE_LOCK_KEY, url.replace(/\/+$/,""));
}

function build(base, path, params){
  const url = new URL(path.replace(/^\//,""), base + "/");
  if (params) for (const [k,v] of Object.entries(params)){
    if (v===undefined || v===null) continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}
async function getJSON(url, opt={}){
  const res = await fetch(url, {
    credentials:"omit", mode:"cors", redirect:"follow",
    ...opt, headers:{ Accept:"application/json", ...(opt.headers||{}) }
  });
  if (!res.ok){
    let body=""; try{ body = await res.text(); }catch{}
    const err = new Error(`API Error ${res.status}${body?`: ${body.slice(0,200)}`:""}`);
    err.status = res.status; throw err;
  }
  return res.json();
}

/* ---------------- Category helpers ---------------- */
export async function fetchCategoryBySlug(slug="cartoon"){
  const url = build(apiBase(), "categories", {
    search: slug, per_page: 100, _fields: "id,slug,name"
  });
  const arr = await getJSON(url);
  const hit = Array.isArray(arr) ? arr.find(c=>c.slug===slug) : null;
  return hit?.id ?? null;
}
export async function ensureCartoonCategoryId(){
  if (cartoonCategoryId) return cartoonCategoryId;
  const cached = read(CARTOON_KEY);
  if (cached){ cartoonCategoryId = Number(cached)||null; return cartoonCategoryId; }
  try{
    cartoonCategoryId = await fetchCategoryBySlug("cartoon");
    if (cartoonCategoryId) write(CARTOON_KEY, String(cartoonCategoryId));
  }catch{ cartoonCategoryId = null; }
  return cartoonCategoryId;
}
export async function getCartoonCategoryId(){ return ensureCartoonCategoryId(); }

/* ---------------- Field helpers ---------------- */
// synchronous best-effort from _embedded
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
// async network fallback using featured_media id
export async function resolveFeaturedImage(post){
  const fromEmbed = getFeaturedImage(post);
  if (fromEmbed) return fromEmbed;

  const id = Number(post?.featured_media)||0;
  if (!id) return null;

  const key = `media:${id}`;
  if (mem.has(key)) return mem.get(key);

  const url = build(apiBase(), `media/${id}`, {
    _fields: "source_url,media_details.sizes"
  });
  try{
    const m = await getJSON(url);
    const sizes = m?.media_details?.sizes || {};
    const src =
      sizes?.medium_large?.source_url ||
      sizes?.large?.source_url ||
      sizes?.medium?.source_url ||
      m?.source_url || null;
    mem.set(key, src || null);
    return src || null;
  }catch{
    mem.set(key, null);
    return null;
  }
}

export function getAuthorName(post){
  try{ return post?._embedded?.author?.[0]?.name || "The Oklahoma Observer"; }
  catch{ return "The Oklahoma Observer"; }
}

/* ---------------- Argument normalization ---------------- */
function norm(page, perPageOrOpts, maybeOpts){
  let p = Number(page)||1;
  let pp = PER_PAGE;
  let excludeCartoon = true;
  let signal;

  const merge = (opts)=>{
    if (!opts) return;
    if (typeof opts.excludeCartoon === "boolean") excludeCartoon = opts.excludeCartoon;
    if (opts.signal) signal = opts.signal;
  };

  if (typeof perPageOrOpts === "number" && isFinite(perPageOrOpts)) {
    pp = perPageOrOpts;
    merge(maybeOpts);
  } else if (perPageOrOpts && typeof perPageOrOpts === "object") {
    if ("aborted" in perPageOrOpts) signal = perPageOrOpts;
    else merge(perPageOrOpts);
  }
  return { page:p, perPage:pp, excludeCartoon, signal };
}

/* ---------------- Posts & Pages ---------------- */
export async function fetchPostsPage(page=1, perPageOrOpts, maybeOpts){
  const { page:p, perPage:pp, excludeCartoon, signal } = norm(page, perPageOrOpts, maybeOpts);

  const params = {
    status:"publish",
    per_page: pp,
    page: p,
    _embed: 1,
    orderby: "date",
    order: "desc",
    _fields: [
      "id","date","title.rendered","excerpt.rendered","author","featured_media","categories",
      "_embedded.author.name",
      "_embedded.wp:featuredmedia.source_url",
      "_embedded.wp:featuredmedia.media_details.sizes"
    ].join(",")
  };

  if (excludeCartoon) {
    const cid = await ensureCartoonCategoryId();
    if (cid) params["categories_exclude"] = cid;
  }

  const url = build(apiBase(), "posts", params);
  return getJSON(url, { signal });
}
export async function fetchLeanPostsPage(page=1, perPageOrOpts, maybeOpts){
  return fetchPostsPage(page, perPageOrOpts, maybeOpts);
}

export async function fetchPostById(id){
  const key = `post:${id}`;
  if (mem.has(key)) return mem.get(key);

  const url = build(apiBase(), `posts/${id}`, {
    _embed: 1,
    _fields: [
      "id","date","title.rendered","content.rendered","author","featured_media","categories",
      "_embedded.author.name",
      "_embedded.wp:featuredmedia.source_url",
      "_embedded.wp:featuredmedia.media_details.sizes"
    ].join(",")
  });
  const data = await getJSON(url);
  mem.set(key, data);
  return data;
}

export async function fetchAboutPage(slugLike="contact-about-donate"){
  const url = build(apiBase(), "pages", {
    search: slugLike, per_page: 1, _fields: "title.rendered,content.rendered"
  });
  try{
    const arr = await getJSON(url);
    const hit = Array.isArray(arr) ? arr[0] : null;
    return { title: hit?.title?.rendered || "About", html: String(hit?.content?.rendered || "") };
  }catch{
    return { title:"About", html:"<p>About page unavailable.</p>" };
  }
}
