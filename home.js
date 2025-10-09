// home.js — OkObserver post summary grid (v2.7.8)
// - Uses <a class="thumb-wrap"><img class="thumb">… to contain thumbnails (no overflow).
// - Infinite scroll with gentle bottom threshold.
// - Saves/Restores scroll position for smooth “Back to Posts”.
// - Shows author & date; title is blue and clickable.

import { fetchLeanPostsPage, fetchAuthorsMap, getCartoonCategoryId } from './api.js';
import { saveScrollForRoute, restoreScrollPosition } from './shared.js';

const HOME_ROUTE = '#/';
const PER_PAGE = 6;

let currentPage = 1;
let isLoading = false;
let reachedEnd = false;
let authorsMap = {};
let cartoonCategoryId = null;
let scrollHandlerBound = false;

export async function renderHome() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="grid" id="post-grid" aria-live="polite"></div>
    <div id="loading" style="text-align:center;margin:2rem;color:#777;">Loading…</div>
  `;

  // Reset paging flags on fresh render
  currentPage = 1;
  reachedEnd = false;
  isLoading = false;

  // Preload helpers (cached by sessionStorage or browser)
  try {
    cartoonCategoryId = await getCartoonCategoryId();
  } catch {
    cartoonCategoryId = null;
  }

  try {
    authorsMap = await fetchAuthorsMap();
  } catch {
    authorsMap = {};
  }

  // First page
  await loadNextPage();

  // Attach infinite scroll once
  if (!scrollHandlerBound) {
    window.addEventListener('scroll', onScroll, { passive: true });
    scrollHandlerBound = true;
  }

  // Try to restore previous scroll (after content lands)
  setTimeout(() => restoreScrollPosition(HOME_ROUTE), 0);
}

async function loadNextPage() {
  if (isLoading || reachedEnd) return;
  isLoading = true;

  const loading = document.getElementById('loading');
  if (loading) loading.textContent = 'Loading…';

  try {
    const posts = await fetchLeanPostsPage(currentPage, PER_PAGE, cartoonCategoryId);

    if (!Array.isArray(posts) || posts.length === 0) {
      reachedEnd = true;
      if (loading) loading.textContent = 'No more posts.';
      return;
    }

    const grid = document.getElementById('post-grid');
    const frag = document.createDocumentFragment();

    for (const post of posts) {
      frag.appendChild(createPostCard(post));
    }

    grid.appendChild(frag);
    currentPage += 1;
    if (loading) loading.textContent = '';
  } catch (err) {
    console.error('[OkObserver] Home load failed:', err);
    if (loading) loading.textContent = 'Error loading posts.';
  } finally {
    isLoading = false;
  }
}

function onScroll() {
  const nearBottom = window.scrollY + window.innerHeight >= (document.body.offsetHeight - 320);
  if (nearBottom) loadNextPage();

  // Continuously save scroll position for this route
  saveScrollForRoute(HOME_ROUTE);
}

function createPostCard(post) {
  const card = document.createElement('div');
  card.className = 'card';

  const titleHTML = post?.title?.rendered ?? '(Untitled)';
  const dateStr = new Date(post.date).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });

  // Author preference: authorsMap -> embedded -> site name
  let authorName = authorsMap[post.author];
  if (!authorName) {
    authorName = post?._embedded?.author?.[0]?.name || 'The Oklahoma Observer';
  }

  // Featured image selection with sensible fallback
  let imgUrl = null;
  const fm = post?._embedded?.['wp:featuredmedia']?.[0];
  if (fm?.media_details?.sizes) {
    const sizes = fm.media_details.sizes;
    imgUrl = sizes?.medium?.source_url
          || sizes?.medium_large?.source_url
          || sizes?.large?.source_url
          || fm?.source_url
          || null;
  } else {
    imgUrl = fm?.source_url || null;
  }
  if (!imgUrl) {
    imgUrl = 'Observer-Logo-2015-08-05.png'; // stable fallback to avoid layout jumps
  }

  // THUMBNAIL (wrapped for fixed aspect & overflow control)
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

  // CARD BODY
  const content = document.createElement('div');
  content.className = 'card-content';
  content.innerHTML = `
    <a href="#/post/${post.id}" class="card-title">${titleHTML}</a>
    <div class="card-meta">By ${escapeHTML(authorName)} • ${dateStr}</div>
    <div class="card-excerpt">${sanitizeExcerpt(post?.excerpt?.rendered || '')}</div>
  `;
  card.appendChild(content);

  return card;
}

// --- helpers ---

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
  // Allow basic markup but remove anchors so excerpts don’t look underlined/clickable.
  const div = document.createElement('div');
  div.innerHTML = excerptHTML || '';

  // Replace <a> with <span> preserving inner HTML
  div.querySelectorAll('a').forEach(a => {
    const span = document.createElement('span');
    span.innerHTML = a.innerHTML;
    a.replaceWith(span);
  });

  // Avoid heavy blocks in the summary
  div.querySelectorAll('blockquote, ul, ol, iframe').forEach(el => el.remove());

  return div.innerHTML;
}

// Public teardown (in case router unloads the view)
export function destroyHome() {
  if (scrollHandlerBound) {
    window.removeEventListener('scroll', onScroll);
    scrollHandlerBound = false;
  }
}

// Public: explicitly restore scroll for this route
export function restoreHomeScroll() {
  restoreScrollPosition(HOME_ROUTE);
}
