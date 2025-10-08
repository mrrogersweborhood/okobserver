// home.js — renders post summaries (Home view)
// v2.4.7 — restores authors + featured images with robust fallbacks

import {
  fetchLeanPostsPage,
  fetchAuthorsMap,
  getAuthorName,
  getFeaturedImage
} from './api.js';
import { createEl, restoreScrollPosition } from './shared.js';

let currentPage = 1;
let isLoading = false;
let allDone = false;
let cachedPosts = [];

/* ------------ tiny helpers ------------ */
function decodeEntity(str = '') {
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

function sanitizeExcerpt(html = '') {
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent || div.innerText || '';
  return text.replace(/\s+/g, ' ').trim();
}

/* ------------ card renderer ------------ */
function makeCard(post, authorMap) {
  const card = createEl('article', { class: 'card' });

  // Featured image (from embed)
  const imgSrc = getFeaturedImage(post);
  if (imgSrc) {
    const img = createEl('img', { src: imgSrc, alt: '', class: 'thumb' });
    img.addEventListener('click', () => {
      try { sessionStorage.setItem('__oko_scroll__', String(window.scrollY || 0)); } catch {}
      location.hash = `#/post/${post.id}`;
    });
    card.append(img);
  }

  // Title (blue and clickable)
  const titleText = post?.title?.rendered ? decodeEntity(post.title.rendered) : 'Untitled';
  const h2 = createEl('h2', { class: 'title' });
  const a  = createEl('a', { href: `#/post/${post.id}` });
  a.textContent = titleText;
  a.style.color = '#1E90FF';
  a.addEventListener('click', (e) => {
    e.preventDefault();
    try { sessionStorage.setItem('__oko_scroll__', String(window.scrollY || 0)); } catch {}
    location.hash = `#/post/${post.id}`;
  });
  h2.append(a);
  card.append(h2);

  // Author (embedded or fallback map)
  const authorName = getAuthorName(post, authorMap);
  if (authorName) {
    const author = createEl('div', { class: 'author' }, [`By ${authorName}`]);
    card.append(author);
  }

  // Excerpt (not clickable)
  const excerpt = createEl('p', { class: 'excerpt' });
  excerpt.textContent = sanitizeExcerpt(post?.excerpt?.rendered || '');
  card.append(excerpt);

  return card;
}

/* ------------ grid helpers ------------ */
function renderGrid(root, authorMap) {
  const grid = root.querySelector('.grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const post of cachedPosts) {
    grid.append(makeCard(post, authorMap));
  }
}

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
      // Build author fallback map when needed
      const missing = [];
      for (const p of posts) {
        const hasEmbedded = !!(p?._embedded?.author?.[0]?.name);
        if (!hasEmbedded && p?.author != null) missing.push(Number(p.author));
      }
      let authorMap = {};
      if (missing.length) {
        try { authorMap = await fetchAuthorsMap(missing); } catch {}
      }

      cachedPosts = cachedPosts.concat(posts);
      renderGrid(root, authorMap);
      currentPage++;
    }
  } catch (err) {
    console.error('[OkObserver] Home load failed:', err);
  }

  if (loader) loader.style.display = 'none';
  isLoading = false;
}

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

/* ------------ main entry ------------ */
export async function renderHome() {
  // Ensure mount exists
  let root = document.getElementById('app');
  if (!root) {
    root = document.createElement('main');
    root.id = 'app';
    const footer = document.querySelector('footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(root, footer);
    else document.body.appendChild(root);
  }

  // Shell
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

  // Restore scroll if coming back from a post
  restoreScrollPosition();
}
