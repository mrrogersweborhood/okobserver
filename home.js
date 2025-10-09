import { apiFetch, fetchLeanPostsPage, fetchAuthorsMap, getCartoonCategoryId } from './api.js';
import { saveScrollForRoute, restoreScrollPosition, scrollToTop } from './shared.js';
import { renderPost } from './detail.js';

const HOME_ROUTE = '#/';
const PER_PAGE = 6;
let currentPage = 1;
let isLoading = false;
let reachedEnd = false;
let authorsMap = {};
let cartoonCategoryId = null;

export async function renderHome() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="grid" id="post-grid"></div>
    <div id="loading" style="text-align:center; margin:2rem; color:#777;">Loading...</div>
  `;

  currentPage = 1;
  reachedEnd = false;
  isLoading = false;

  cartoonCategoryId = await getCartoonCategoryId();
  authorsMap = await fetchAuthorsMap();

  await loadNextPage();

  window.addEventListener('scroll', handleScroll);
}

async function loadNextPage() {
  if (isLoading || reachedEnd) return;

  isLoading = true;
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = 'Loading...';

  try {
    const posts = await fetchLeanPostsPage(currentPage, PER_PAGE, cartoonCategoryId);

    if (!posts.length) {
      reachedEnd = true;
      if (loading) loading.textContent = 'No more posts.';
      return;
    }

    const grid = document.getElementById('post-grid');
    for (const post of posts) {
      const card = createPostCard(post);
      grid.appendChild(card);
    }

    currentPage++;
    if (loading) loading.textContent = '';
  } catch (err) {
    console.error('[OkObserver] Home load failed:', err);
    const loading = document.getElementById('loading');
    if (loading) loading.textContent = 'Error loading posts.';
  } finally {
    isLoading = false;
  }
}

function createPostCard(post) {
  const card = document.createElement('div');
  card.className = 'card';

  const title = post.title?.rendered || '(Untitled)';
  const excerpt = post.excerpt?.rendered || '';
  const date = new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const authorName = authorsMap[post.author] || 'Unknown Author';
  const featured = post._embedded?.['wp:featuredmedia']?.[0];
  const imgUrl = featured?.media_details?.sizes?.medium?.source_url || featured?.source_url || 'icon.png';

  // WRAPPED THUMBNAIL (the key fix)
  const thumbWrap = document.createElement('a');
  thumbWrap.className = 'thumb-wrap';
  thumbWrap.href = `#/post/${post.id}`;
  thumbWrap.innerHTML = `<img class="thumb" src="${imgUrl}" alt="${title}" loading="lazy" />`;
  card.appendChild(thumbWrap);

  const content = document.createElement('div');
  content.className = 'card-content';
  content.innerHTML = `
    <a href="#/post/${post.id}" class="card-title">${title}</a>
    <div class="meta">By ${authorName} • ${date}</div>
    <div class="excerpt">${excerpt}</div>
  `;
  card.appendChild(content);

  return card;
}

function handleScroll() {
  const scrollY = window.scrollY;
  const innerHeight = window.innerHeight;
  const bodyHeight = document.body.offsetHeight;

  if (scrollY + innerHeight >= bodyHeight - 300) {
    loadNextPage();
  }

  // Save scroll position for returning from detail page
  saveScrollForRoute(HOME_ROUTE);
}

export function destroyHome() {
  window.removeEventListener('scroll', handleScroll);
}

export function restoreHomeScroll() {
  restoreScrollPosition(HOME_ROUTE);
}
