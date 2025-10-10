// home.js — OkObserver post summary grid
// v2.5.6 (clickable image on summary + robust cartoon filtering)

import {
  fetchLeanPostsPage,
  fetchAuthorsMap,
  getCartoonCategoryId,
  pickFeaturedImage
} from './api.js';

const PER_PAGE = 6;

let state = {
  page: 1,
  loading: false,
  end: false,
  authors: new Map(),
  cartoonCatId: 0,
  scrollHandlerAttached: false
};

export async function renderHome() {
  const app = document.getElementById('app');
  if (!app) return;

  // Fresh container
  app.innerHTML = `
    <section class="grid" id="post-grid" aria-live="polite"></section>
    <div id="home-loading" style="text-align:center;margin:1.5rem;color:#777">Loading…</div>
  `;

  // Reset state
  state.page = 1;
  state.loading = false;
  state.end = false;

  // Warm lookups
  try { state.cartoonCatId = await getCartoonCategoryId(); } catch { state.cartoonCatId = 0; }
  try { state.authors = await fetchAuthorsMap(); } catch { state.authors = new Map(); }

  // First page
  await loadNextPage();

  // Infinite scroll once
  if (!state.scrollHandlerAttached) {
    window.addEventListener('scroll', onScroll, { passive: true });
    state.scrollHandlerAttached = true;
  }
}

function onScroll() {
  const threshold = document.body.offsetHeight - window.innerHeight - 320;
  if (window.scrollY >= threshold) loadNextPage();
}

async function loadNextPage() {
  if (state.loading || state.end) return;

  state.loading = true;
  const loading = document.getElementById('home-loading');
  if (loading) loading.textContent = 'Loading…';

  try {
    const posts = await fetchLeanPostsPage(state.page, { excludeCategoryId: state.cartoonCatId });

    if (!Array.isArray(posts) || posts.length === 0) {
      state.end = true;
      if (loading) loading.textContent = 'No more posts.';
      return;
    }

    const grid = document.getElementById('post-grid');
    const frag = document.createDocumentFragment();

    for (const post of posts) {
      // client-side safety: strip cartoon by slug/name if needed
      if (isCartoonPost(post, state.cartoonCatId)) continue;
      const card = renderCard(post, state.authors);
      frag.appendChild(card);
    }

    grid.appendChild(frag);
    state.page += 1;
    if (loading) loading.textContent = '';
  } catch (err) {
    console.error('[OkObserver] Home load failed:', err);
    if (loading) loading.textContent = 'Error loading posts.';
  } finally {
    state.loading = false;
  }
}

function isCartoonPost(post, cartoonId = 0) {
  const terms = (post?._embedded?.['wp:term'] || []).flat().filter(Boolean);
  for (const t of terms) {
    const slug = (t?.slug || '').toLowerCase();
    const name = (t?.name || '').toLowerCase();
    if (slug === 'cartoon' || name === 'cartoon') return true;
  }
  if (cartoonId && Array.isArray(post?.categories)) {
    if (post.categories.includes(cartoonId)) return true;
  }
  return false;
}

function renderCard(post, authorsMap) {
  const card = document.createElement('article');
  card.className = 'card';

  const titleHTML = post?.title?.rendered || '(Untitled)';
  const dateStr = formatDate(post?.date);
  const byline =
    (authorsMap && authorsMap.get && authorsMap.get(post?.author)) ||
    post?._embedded?.author?.[0]?.name ||
    '—';

  // clickable image (wrap in anchor)
  const link = document.createElement('a');
  link.href = `#/post/${post.id}`;
  link.className = 'thumb-link';
  link.setAttribute('aria-label', 'Open post');

  const wrap = document.createElement('div');
  wrap.className = 'thumb-wrap';

  const img = document.createElement('img');
  img.className = 'thumb';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.alt = textOnly(titleHTML);
  img.src = pickFeaturedImage(post) || 'Observer-Logo-2015-08-05.png';

  wrap.appendChild(img);
  link.appendChild(wrap);
  card.appendChild(link);

  // body
  const h2 = document.createElement('h2');
  h2.className = 'title';
  h2.innerHTML = `<a href="#/post/${post.id}">${titleHTML}</a>`;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `By ${byline}${dateStr ? ` • ${dateStr}` : ''}`;

  const excerpt = document.createElement('div');
  excerpt.className = 'excerpt';
  excerpt.innerHTML = sanitizeExcerpt(post?.excerpt?.rendered || '');

  card.appendChild(h2);
  card.appendChild(meta);
  card.appendChild(excerpt);

  return card;
}

// ---------- helpers ----------
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function textOnly(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || '').trim();
}

function sanitizeExcerpt(excerptHTML) {
  const div = document.createElement('div');
  div.innerHTML = excerptHTML || '';

  // Replace links with spans (no clickable clutter in excerpts)
  div.querySelectorAll('a').forEach(a => {
    const span = document.createElement('span');
    span.innerHTML = a.innerHTML;
    a.replaceWith(span);
  });

  // Drop heavy/structural blocks
  div.querySelectorAll('iframe, blockquote, ul, ol').forEach(el => el.remove());

  return div.innerHTML;
}
