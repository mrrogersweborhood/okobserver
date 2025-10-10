// home.js — OkObserver post summary grid
// v2.5.4
//
// Responsibilities:
// - Render paginated post grid with infinite scroll
// - Show featured image (thumb), title (blue link), author, date, excerpt
// - Robust to missing featured media (falls back to site logo image)
// - Keep DOM/CSS structure aligned with index.html (.grid, .card, .thumb-wrap, .card-content)
//
// No scroll memory here — router (core.js) handles saving/restoring route scroll.

import { fetchLeanPostsPage, fetchAuthorsMap, getCartoonCategoryId } from './api.js';

const PER_PAGE = 6;

let state = {
  page: 1,
  loading: false,
  end: false,
  authors: {},
  cartoonCatId: null,
  scrollHandlerAttached: false
};

export async function renderHome() {
  const app = document.getElementById('app');
  if (!app) return;

  // Fresh container
  app.innerHTML = `
    <div class="grid" id="post-grid" aria-live="polite"></div>
    <div id="home-loading" style="text-align:center;margin:1.5rem;color:#777">Loading…</div>
  `;

  // Reset state for a fresh home render
  state.page = 1;
  state.loading = false;
  state.end = false;

  // Warm lookups (cached in sessionStorage by api.js where possible)
  try { state.cartoonCatId = await getCartoonCategoryId(); } catch { state.cartoonCatId = null; }
  try { state.authors = await fetchAuthorsMap(); } catch { state.authors = {}; }

  // First page load
  await loadNextPage();

  // Attach infinite scroll once
  if (!state.scrollHandlerAttached) {
    window.addEventListener('scroll', onScroll, { passive: true });
    state.scrollHandlerAttached = true;
  }
}

function onScroll() {
  // Near-bottom threshold
  const threshold = document.body.offsetHeight - window.innerHeight - 320;
  if (window.scrollY >= threshold) {
    loadNextPage();
  }
}

async function loadNextPage() {
  if (state.loading || state.end) return;

  const loading = document.getElementById('home-loading');
  if (loading) loading.textContent = 'Loading…';
  state.loading = true;

  try {
    const posts = await fetchLeanPostsPage(state.page, PER_PAGE, state.cartoonCatId);

    if (!Array.isArray(posts) || posts.length === 0) {
      state.end = true;
      if (loading) loading.textContent = 'No more posts.';
      return;
    }

    const grid = document.getElementById('post-grid');
    const frag = document.createDocumentFragment();

    for (const post of posts) {
      frag.appendChild(renderCard(post));
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

function renderCard(post) {
  const card = document.createElement('article');
  card.className = 'card';

  // Title (HTML from WP)
  const titleHTML = post?.title?.rendered || '(Untitled)';

  // Date
  const dateStr = formatDate(post?.date);

  // Author: prefer authors map → embedded → fallback name
  let authorName = state.authors[post?.author];
  if (!authorName) {
    authorName = post?._embedded?.author?.[0]?.name || 'The Oklahoma Observer';
  }

  // Featured image (choose a reasonable size; fallback to shipped logo)
  const imgUrl = pickThumb(post) || 'Observer-Logo-2015-08-05.png';

  // Thumb (wrapped for aspect-ratio + containment)
  const thumbWrap = document.createElement('a');
  thumbWrap.className = 'thumb-wrap';
  thumbWrap.href = `#/post/${post.id}`;
  thumbWrap.setAttribute('aria-label', 'Open post');

  const img = document.createElement('img');
  img.className = 'thumb';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.alt = textOnly(titleHTML);
  img.src = imgUrl;

  thumbWrap.appendChild(img);
  card.appendChild(thumbWrap);

  // Body
  const body = document.createElement('div');
  body.className = 'card-content';
  body.innerHTML = `
    <h2><a class="card-title" href="#/post/${post.id}">${titleHTML}</a></h2>
    <p class="meta">By ${escapeHTML(authorName)} • ${escapeHTML(dateStr)}</p>
    <p class="excerpt">${sanitizeExcerpt(post?.excerpt?.rendered || '')}</p>
  `;
  card.appendChild(body);

  return card;
}

// ---------- helpers ----------

function pickThumb(post) {
  const media = post?._embedded?.['wp:featuredmedia']?.[0];
  if (!media) return null;
  const sizes = media?.media_details?.sizes || {};
  return (
    sizes?.medium_large?.source_url ||
    sizes?.large?.source_url ||
    sizes?.medium?.source_url ||
    media?.source_url ||
    null
  );
}

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

function escapeHTML(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeExcerpt(excerptHTML) {
  // Keep basic formatting, remove anchors so the excerpt isn't full of fake links
  const div = document.createElement('div');
  div.innerHTML = excerptHTML || '';

  // Replace <a> with <span> while preserving inner content
  div.querySelectorAll('a').forEach(a => {
    const span = document.createElement('span');
    span.innerHTML = a.innerHTML;
    a.replaceWith(span);
  });

  // Strip problematic heavy blocks from summaries
  div.querySelectorAll('iframe, blockquote, ul, ol').forEach(el => el.remove());

  return div.innerHTML;
}
