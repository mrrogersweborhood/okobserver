// OkObserver — Home view (safe, self-contained, non-breaking)

/* -------------------------
   Light dependencies / fallbacks
-------------------------- */

// We prefer to consume a global API base that main.js logs as “API base (locked)”
const API_BASE = (window && window.API_BASE) || 'api/wp/v2';

// Route keys for scroll restoration (simple + robust)
const ROUTE_KEY = 'route:/';
const SCROLL_KEY = `${ROUTE_KEY}:scrollY`;

// Small helper: HTML -> plain text
function stripHtml(html) {
  if (!html) return '';
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent || el.innerText || '';
}

// Small helper: create element with classes/attrs
function el(tag, opts = {}, children = []) {
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

/* -------------------------
   API helpers (resilient)
-------------------------- */

async function apiFetchJson(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API Error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Look up “cartoon” category id; if not available, we continue without exclusion.
let cachedCartoonCatId = null;
async function getCartoonCategoryId() {
  if (cachedCartoonCatId !== null) return cachedCartoonCatId;
  try {
    const url = `${API_BASE}/categories?search=cartoon&per_page=100&_fields=id,slug,name`;
    const data = await apiFetchJson(url);
    const hit = Array.isArray(data) ? data.find(c => /cartoon/i.test(c.slug) || /cartoon/i.test(c.name)) : null;
    cachedCartoonCatId = hit ? hit.id : 0;
  } catch (_) {
    // 404 or disabled categories endpoint: proceed without exclusion.
    cachedCartoonCatId = 0;
    console.warn('[OkObserver] cartoon category lookup failed; proceeding without exclusion');
  }
  return cachedCartoonCatId;
}

// Pull one page of lean posts (with embed to get author + featured media)
async function fetchPostsPage(page = 1, perPage = 6, excludeCartoon = true) {
  let categoriesExclude = '';
  if (excludeCartoon) {
    const catId = await getCartoonCategoryId();
    if (catId) categoriesExclude = `&categories_exclude=${encodeURIComponent(catId)}`;
  }
  const fields =
    'id,date,title.rendered,excerpt.rendered,author,featured_media,categories,' +
    '_embedded.author.name,_embedded.wp:featuredmedia.source_url,' +
    '_embedded.wp:featuredmedia.media_details.sizes';

  const url =
    `${API_BASE}/posts?status=publish&per_page=${perPage}&page=${page}` +
    `&_embed=1&orderby=date&order=desc&_fields=${encodeURIComponent(fields)}` +
    categoriesExclude;

  return apiFetchJson(url);
}

/* -------------------------
   Card rendering
-------------------------- */

function selectThumb(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia'];
    if (media && media[0]) {
      // Prefer a medium/large-ish size if available
      const sizes = media[0]?.media_details?.sizes || {};
      const preferred =
        sizes.medium_large?.source_url ||
        sizes.large?.source_url ||
        sizes.medium?.source_url ||
        media[0].source_url;
      if (preferred) return preferred;
    }
  } catch (_) {}
  return ''; // no image
}

function renderCard(post) {
  const href = `#/post/${post.id}`;
  const title = stripHtml(post?.title?.rendered) || 'Untitled';
  const byline = `By ${post?._embedded?.author?.[0]?.name || 'Oklahoma Observer'} • ${new Date(post.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
  const excerpt = stripHtml(post?.excerpt?.rendered).trim();

  const card = el('article', { className: 'card' });

  // Thumbnail area — wrapped for aspect ratio containment
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

  // Body
  const body = el('div', { className: 'card-body' }, [
    el('h2', null, el('a', { attrs: { href } }, title)),
    el('div', { className: 'meta' }, byline),
    el('div', { className: 'excerpt' }, excerpt)
  ]);

  card.appendChild(body);
  return card;
}

/* -------------------------
   Paging / Infinite load (optional)
-------------------------- */

async function loadFirstPage(gridEl) {
  const posts = await fetchPostsPage(1, 6, true);
  if (!Array.isArray(posts)) return;
  posts.forEach(p => gridEl.appendChild(renderCard(p)));
}

/* -------------------------
   Scroll save/restore
-------------------------- */

function saveScroll() {
  try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0)); } catch (_) {}
}
function restoreScroll() {
  try {
    const y = parseInt(sessionStorage.getItem(SCROLL_KEY) || '0', 10);
    if (!Number.isNaN(y)) window.scrollTo(0, y);
  } catch (_) {}
}

/* -------------------------
   Public entry
-------------------------- */

export async function renderHome(container) {
  // Default container — main#app
  const host = container || document.getElementById('app');
  if (!host) {
    console.error('[OkObserver] app container not found');
    return;
  }

  // Basic structure
  host.innerHTML = '';
  const section = el('section');
  const h1 = el('h1', null, 'Latest Posts');
  const grid = el('div', { className: 'grid' });

  section.appendChild(h1);
  section.appendChild(grid);
  host.appendChild(section);

  // Load & render
  try {
    await loadFirstPage(grid);
  } catch (err) {
    console.error('[OkObserver] Home load failed:', err);
    const fail = el('div', { className: 'card-body' }, String(err.message || err));
    host.appendChild(fail);
  }

  // Restore previous scroll (if returning from a detail view)
  restoreScroll();

  // Save scroll position before navigating away
  // (core/router should call this too, but this is a safe double-guard)
  window.removeEventListener('beforeunload', saveScroll);
  window.addEventListener('beforeunload', saveScroll, { once: true });
}

// Default export for setups that expect it
export default renderHome;
