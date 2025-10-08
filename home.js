// home.js — renders post summaries (Home view)
// Compatible with api.js v2.4.5 and core.js v2.4.4

import { fetchLeanPostsPage } from './api.js';
import { createEl, restoreScrollPosition } from './shared.js';

const PER_PAGE = 6; // Default number of posts per page
let currentPage = 1;
let isLoading = false;
let allDone = false;
let cachedPosts = [];

let scrollYBeforeNav = 0;

// Decode HTML entities
function decodeEntity(str) {
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

// Clean and shorten excerpt safely
function sanitizeExcerpt(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent || div.innerText || '';
  return text.replace(/\s+/g, ' ').trim();
}

// Utility to create a card for each post
function makeCard(post) {
  const card = createEl('article', { class: 'card' });

  // Featured image
  let imgSrc = '';
  try {
    imgSrc =
      post._embedded?.['wp:featuredmedia']?.[0]?.media_details?.sizes?.medium?.source_url ||
      post._embedded?.['wp:featuredmedia']?.[0]?.source_url ||
      '';
  } catch {}
  if (imgSrc) {
    const img = createEl('img', { src: imgSrc, alt: '', class: 'thumb' });
    img.addEventListener('click', () => {
      try { sessionStorage.setItem('__oko_scroll__', String(window.scrollY || 0)); } catch {}
      location.hash = `#/post/${post.id}`;
    });
    card.append(img);
  }

  // Title
  const title = createEl('h2', { class: 'title' });
  const titleLink = createEl('a', { href: `#/post/${post.id}` });
  titleLink.textContent = (post.title?.rendered ? decodeEntity(post.title.rendered) : 'Untitled');
  titleLink.style.color = '#1E90FF';
  titleLink.addEventListener('click', (e) => {
    e.preventDefault();
    try { sessionStorage.setItem('__oko_scroll__', String(window.scrollY || 0)); } catch {}
    location.hash = `#/post/${post.id}`;
  });
  title.append(titleLink);
  card.append(title);

  // Author (from embed)
  const authorName =
    post._embedded?.author?.[0]?.name || post._embedded?.['author']?.[0]?.name;
  if (authorName) {
    const author = createEl('div', { class: 'author' }, [`By ${authorName}`]);
    card.append(author);
  }

  // Excerpt
  const excerpt = createEl('p', { class: 'excerpt' });
  excerpt.innerHTML = sanitizeExcerpt(post.excerpt?.rendered || '');
  card.append(excerpt);

  return card;
}

// Render the full grid from cached posts
function renderGrid(root) {
  const grid = root.querySelector('.grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const post of cachedPosts) {
    grid.append(makeCard(post));
  }
}

// Fetch and append next page
async function loadNextPage(root) {
  if (isLoading || allDone) return;
  isLoading = true;

  const loader = root.querySelector('#loader');
  if (loader) loader.style.display = 'block';

  try {
    const posts = await fetchLeanPostsPage(currentPage);
    if (!posts.length) {
      allDone = true;
    } else {
      cachedPosts = cachedPosts.concat(posts);
      renderGrid(root);
      currentPage++;
    }
  } catch (err) {
    console.error('[OkObserver] Home load failed:', err);
  }

  if (loader) loader.style.display = 'none';
  isLoading = false;
}

// Observe bottom sentinel for infinite scroll
function setupInfiniteScroll(root) {
  const sentinel = root.querySelector('#sentinel');
  if (!sentinel) return;
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      loadNextPage(root);
    }
  }, { rootMargin: '900px 0px' });
  io.observe(sentinel);
}

// Main render entry
export async function renderHome() {
  const root = document.getElementById('app');     // ✅ target #app (not #root)
  if (!root) return;

  root.innerHTML = `
    <section id="home">
      <div class="grid"></div>
      <div id="loader" style="display:none;">Loading…</div>
      <div id="sentinel"></div>
    </section>
  `;

  currentPage = 1;
  allDone = false;
  cachedPosts = [];

  await loadNextPage(root);
  setupInfiniteScroll(root);

  // Restore scroll position if returning from a post
  restoreScrollPosition();
}

// Save current scroll before leaving home (in case you call it elsewhere)
export function saveScrollBeforeNav() {
  scrollYBeforeNav = window.scrollY;
  try {
    sessionStorage.setItem('__oko_scroll__', String(scrollYBeforeNav));
  } catch {}
}
