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

function el(tag, opts = {}, children = []) {
  // null-safe
  opts = opts || {}; if (children == null) children = [];
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.attrs) Object.entries(opts.attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (!Array.isArray(children)) children = [children];
  children.forEach(c => {
    if (c == null) return;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  });
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
    const url = `${API_BASE}/categories?search=cartoon&per_page=100&_fields=id,slug,name`;
    const { json } = await apiFetchJson(url);
    const hit = Array.isArray(json) ? json.find(c => /cartoon/i.test(c.slug) || /cartoon/i.test(c.name)) : null;
    cachedCartoonCatId = hit ? hit.id : 0;
  } catch (_) {
    cachedCartoonCatId = 0;
  }
  return cachedCartoonCatId;
}

async function fetchPostsPage(page = 1, perPage = 9, excludeCartoon = true) {
  let categoriesExclude = '';
  if (excludeCartoon) {
    const catId = await getCartoonCategoryId();
    if (catId) categoriesExclude = `&categories_exclude=${encodeURIComponent(catId)}`;
  }
  const url =
    `${API_BASE}/posts?status=publish&per_page=${perPage}&page=${page}` +
    `&_embed=1&orderby=date&order=desc` +
    categoriesExclude;

  const { json, headers } = await apiFetchJson(url);
  const totalPages = parseInt(headers.get('X-WP-TotalPages') || '0', 10) || 0;
  return { posts: json, totalPages };
}

/* -------------------------
   Card rendering
-------------------------- */

function selectThumb(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia'];
    if (media && media[0]) {
      const sizes = media[0]?.media_details?.sizes || {};
      const order = ['medium_large','large','medium','post-thumbnail','thumbnail','full'];
      for (const k of order) {
        const u = sizes[k]?.source_url;
        if (u) return normalizeUrl(u);
      }
      if (media[0].source_url) return normalizeUrl(media[0].source_url);
    }
  } catch (_) {}

  const fromContent = firstImageFrom(post?.content?.rendered || '');
  if (fromContent) return fromContent;
  const fromExcerpt = firstImageFrom(post?.excerpt?.rendered || '');
  if (fromExcerpt) return fromExcerpt;

  return '';
}

function renderCard(post) {
  const href = `#/post/${post.id}`;
  const title = stripHtml(post?.title?.rendered) || 'Untitled';
  const byline = `By ${post?._embedded?.author?.[0]?.name || 'Oklahoma Observer'} • ${new Date(post.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
  const excerpt = stripHtml(post?.excerpt?.rendered).trim();

  const card = el('article', { className: 'card' });

  const imgUrl = selectThumb(post);
  if (imgUrl) {
    const wrap = el('a', {
      className: 'thumb-wrap',
      attrs: { href, 'aria-label': `Open post: ${title}` }
    });
    const img = el('img', { className: 'thumb', attrs: { src: imgUrl, alt: '' } });
    wrap.appendChild(img);
    card.appendChild(wrap);
  }

  const body = el('div', { className: 'card-body' }, [
    el('h2', null, el('a', { attrs: { href } }, title)),
    el('div', { className: 'meta' }, byline),
    el('div', { className: 'excerpt' }, excerpt)
  ]);

  card.appendChild(body);
  return card;
}

/* -------------------------
   Home view with infinite scroll
-------------------------- */

export async function renderHome(container) {
  const host = container || document.getElementById('app');
  if (!host) {
    console.error('[OkObserver] app container not found');
    return;
  }

  host.innerHTML = '';
  const section = el('section');
  const h1 = el('h1', null, 'Latest Posts');
  const grid = el('div', { className: 'grid' });
  const sentinel = el('div', { className: 'hidden', attrs: { 'data-sentinel': '1' } });

  section.appendChild(h1);
  section.appendChild(grid);
  host.appendChild(section);
  host.appendChild(sentinel);

  let currentPage = 1;
  let totalPages = 1;
  let loading = false;

  async function loadPage(page) {
    if (loading) return;
    loading = true;
    try {
      const { posts, totalPages: tp } = await fetchPostsPage(page, 9, true);
      if (tp) totalPages = tp;
      if (Array.isArray(posts)) posts.forEach(p => grid.appendChild(renderCard(p)));
    } catch (err) {
      console.error('[OkObserver] Home load failed:', err);
      const fail = el('div', { className: 'card-body' }, String(err.message || err));
      host.appendChild(fail);
    } finally {
      loading = false;
    }
  }

  await loadPage(1);

  const io = new IntersectionObserver(async (entries) => {
    const e = entries[0];
    if (!e || !e.isIntersecting) return;
    if (loading) return;
    if (currentPage >= totalPages) return;
    currentPage += 1;
    await loadPage(currentPage);
  }, { rootMargin: '600px 0px 600px 0px' });

  io.observe(sentinel);
}

export default renderHome;
