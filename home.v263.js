// OkObserver — Home view (robust, with thumbnails + infinite scroll)

/* -------------------------
   Config / API base
-------------------------- */
const API_BASE = (window && (window.API_BASE || window.OKO_API_BASE)) || 'api/wp/v2';

/* -------------------------
   Utilities
-------------------------- */
function stripHtml(html) {
  if (!html) return '';
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent || el.innerText || '';
}

// ✅ Null-safe element helper (prevents "reading 'className' of null")
function el(tag, opts = {}, children = []) {
  opts = opts || {};
  if (children == null) children = [];
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) if (v != null) node.setAttribute(k, v);
  if (!Array.isArray(children)) children = [children];
  for (const c of children) {
    if (c == null) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function normalizeUrl(u){
  try{
    if(!u) return '';
    u = String(u).trim();
    if(u.startsWith('//')) return 'https:' + u;
    return u.replace(/^http:\/\//, 'https://');
  }catch(_){ return u || ''; }
}

function firstImageFrom(html){
  try{
    if(!html) return '';
    const root = document.createElement('div');
    root.innerHTML = html;
    const img = root.querySelector('img');
    if(!img) return '';
    const pick = img.getAttribute('src') || img.getAttribute('data-src') ||
                 img.getAttribute('data-lazy-src') || img.getAttribute('data-original') ||
                 img.getAttribute('data-orig-file') || '';
    if (pick) return normalizeUrl(pick);
    const srcset = img.getAttribute('srcset') || '';
    if (srcset){
      const first = srcset.split(',')[0].trim().split(' ')[0];
      if (first) return normalizeUrl(first);
    }
  }catch(_){}
  return '';
}

/* -------------------------
   API helpers
-------------------------- */
async function apiFetchJson(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API Error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return { json: data, headers: res.headers };
}

let cachedCartoonCatId = null;
async function getCartoonCategoryId() {
  if (cachedCartoonCatId !== null) return cachedCartoonCatId;
  try {
    const url = `${API_BASE}/categories?search=cartoon&per_page=100&_fields=id,slug,n_
