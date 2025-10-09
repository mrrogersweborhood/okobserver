// home.js — OkObserver home (post summary grid) v2.7.8
// - Uses thumb-wrap wrapper to contain thumbnails (no overflow, uniform 16:9).
// - Infinite scroll.
// - Saves and restores scroll position for smooth "Back to posts" flow.
// - Shows author + date; blue clickable title.

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

  // Reset paging flags
  currentPage = 1;
  reachedEnd = false;
  isLoading = false;

  // Data that benefits from caching
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

  // Attach infinite scroll handler once
  if (!scrollHandlerBound) {
    window.addEventListener('scroll', onScroll, { passive: true });
    scrollHandlerBound = true;
  }

  // After first paint, try restoring scroll position
  // (timeout helps ensure layout has content to scroll to)
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
      const card = createPostCard(post);
      frag.appendChild(card);
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

  const titleHTML = (post?.title?.rendered ?? '(Untitled)');
  const dateStr = new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Author: prefer authorsMap; fallback to _embedded author name if present
  let authorName = authorsMap[post.author];
  if (!authorName) {
    const embedded = post?._embedded?.author?.[0]?.name;
    authorName = embedded || 'The Oklahoma Observer';
  }

  // Featured image selection (prefer an appropriate size)
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
    // very final fallback; keeps layout stable
    imgUrl = 'Observer-Logo-2015-08-05.png';
  }

  // THUMBNAIL (wrapped for aspect-ratio & overflow control)
  const thumbWrap = document.createElement('a');
  thumbWrap.className = 'thumb-wrap';
  thumbWrap.href = `#/post/${post.id}`;
  thumbWrap.setAttribute('aria-label', 'Open post');

  const img = document.createElement('img');
  img.className = 'thumb';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.alt = stripHTML(titleHTML);
  img.src = imgUrl;

  thumbWrap.appendChild(img);
  card.appendChild(thumbWrap);

  // CARD BODY
  const content = document.createElement('div');
  content.className = 'card-content';
  content.innerHTML = `
    <a href="#/post/${post.id}" class="card-title">${titleHTML}</a>
    <div class="meta">By ${escapeHTML(authorName)} • ${dateStr}</div>
    <div class="excerpt">${sanitizeExcerpt(post?.excerpt?.rendered || '')}</div>
  `;
  card.appendChild(content);

  return card;
}

// Helpers
function stripHTML(html) {
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
  // Allow WP excerpt markup but prevent underlines-as-links leakage:
  // Keep basic tags <p><em><strong><br> and strip anchors
  const div = document.createElement('div');
  div.innerHTML = excerptHTML || '';

  // Remove <a> but keep their text content
  div.querySelectorAll('a').forEach(a => {
    const span = document.createElement('span');
    span.innerHTML = a.innerHTML;
    a.replaceWith(span);
  });

  // Optional: prevent overly-long blockquotes/lists in excerpts (rare)
  div.querySelectorAll('blockquote, ul, ol').forEach(el => el.remove());

  return div.innerHTML;
}

// Public teardown (in case router wants to detach handlers)
export function destroyHome() {
  if (scrollHandlerBound) {
    window.removeEventListener('scroll', onScroll);
    scrollHandlerBound = false;
  }
}

// Public: explicitly restore scroll position for this route
export function restoreHomeScroll() {
  restoreScrollPosition(HOME_ROUTE);
}
