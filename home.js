// home.js — renders post summaries (Home view)
// v2.5.5 — restores exact card after returning from detail:
//           - remembers {postId, page, scrollY} when navigating to detail
//           - loads pages until the target card exists
//           - scrolls into view, focuses title link, and highlights card

import {
  fetchLeanPostsPage,
  fetchAuthorsMap,
  getAuthorName,
  getFeaturedImage
} from './api.js';
import { createEl } from './shared.js';

let currentPage = 1;
let isLoading = false;
let allDone = false;
let cachedPosts = [];

/* ------------ small utils ------------ */
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

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const opts = { year: 'numeric', month: 'long', day: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}

function setReturnTarget(postId) {
  try {
    sessionStorage.setItem(
      '__oko_return_target__',
      JSON.stringify({
        id: Number(postId),
        page: currentPage,
        y: window.scrollY || 0,
        t: Date.now()
      })
    );
  } catch {}
}

function readReturnTarget() {
  try {
    const raw = sessionStorage.getItem('__oko_return_target__');
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.id !== 'number') return null;
    return obj;
  } catch { return null; }
}

function clearReturnTarget() {
  try { sessionStorage.removeItem('__oko_return_target__'); } catch {}
}

/* ------------ card renderer ------------ */
function makeCard(post, authorMap) {
  const card = createEl('article', { class: 'card', 'data-id': String(post.id) });

  // Featured image
  const imgSrc = getFeaturedImage(post);
  if (imgSrc) {
    const img = createEl('img', { src: imgSrc, alt: '', class: 'thumb' });
    img.addEventListener('click', () => {
      setReturnTarget(post.id);
      location.hash = `#/post/${post.id}`;
    });
    card.append(img);
  }

  // Title (blue, clickable)
  const titleText = post?.title?.rendered ? decodeEntity(post.title.rendered) : 'Untitled';
  const h2 = createEl('h2', { class: 'title' });
  const a = createEl('a', { href: `#/post/${post.id}`, 'data-link': 'title' });
  a.textContent = titleText;
  a.style.color = '#1E90FF';
  a.addEventListener('click', (e) => {
    e.preventDefault();
    setReturnTarget(post.id);
    location.hash = `#/post/${post.id}`;
  });
  h2.append(a);
  card.append(h2);

  // Meta: Author + Date
  const authorName = getAuthorName(post, authorMap);
  const dateStr = formatDate(post.date);
  const meta = createEl('div', { class: 'meta' });
  meta.textContent = `${authorName ? `By ${authorName}` : ''}${authorName && dateStr ? ' • ' : ''}${dateStr}`;
  card.append(meta);

  // Excerpt
  const excerpt = createEl('p', { class: 'excerpt' });
  excerpt.textContent = sanitizeExcerpt(post?.excerpt?.rendered || '');
  card.append(excerpt);

  return card;
}

/* ------------ grid helpers ------------ */
function renderGrid(root, authorMap) {
  const grid = root.querySelector('.grid');
  if (!grid) return;
  // Append-only render for smooth infinite scroll
  const frag = document.createDocumentFragment();
  for (const post of cachedPosts) {
    // Skip already-rendered posts (in case of duplicate calls)
    if (grid.querySelector(`.card[data-id="${post.id}"]`)) continue;
    frag.append(makeCard(post, authorMap));
  }
  grid.append(frag);
}

async function loadNextPage(root) {
  if (isLoading || allDone) return false;
  isLoading = true;

  const loader = root.querySelector('#loader');
  if (loader) loader.style.display = 'block';

  try {
    const posts = await fetchLeanPostsPage(currentPage);
    if (!posts.length) {
      allDone = true;
    } else {
      const missing = [];
      for (const p of posts) {
        const hasEmbedded = !!(p?._embedded?.author?.[0]?.name);
        if (!hasEmbedded && p?.author != null) missing.push(Number(p.author));
      }
      let authorMap = {};
      if (missing.length) {
        try { authorMap = await fetchAuthorsMap(missing); } catch {}
      }

      // Append page
      cachedPosts = cachedPosts.concat(posts);
      renderGrid(root, authorMap);
      currentPage++;
    }
  } catch (err) {
    console.error('[OkObserver] Home load failed:', err);
  } finally {
    if (loader) loader.style.display = 'none';
    isLoading = false;
  }

  return true;
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

/* ------------ restore focus/position after return ------------ */
async function ensureTargetVisible(root) {
  const tgt = readReturnTarget();
  if (!tgt) return;

  const grid = root.querySelector('.grid');
  if (!grid) return;

  // Try to find the card; if missing, keep loading until found or done
  let tries = 0;
  while (!grid.querySelector(`.card[data-id="${tgt.id}"]`) && !allDone && tries < 20) {
    // load more pages if available
    const progressed = await loadNextPage(root);
    if (!progressed) break;
    tries++;
  }

  const card = grid.querySelector(`.card[data-id="${tgt.id}"]`);
  if (card) {
    // Prefer focusing the title and centering the card
    const link = card.querySelector('a[data-link="title"]') || card;
    card.classList.add('oko-focus-pulse');
    link.focus?.();
    card.scrollIntoView({ behavior: 'instant', block: 'center' });
    // brief highlight
    setTimeout(() => card.classList.remove('oko-focus-pulse'), 900);
  } else {
    // Fallback: use stored Y
    if (typeof tgt.y === 'number') window.scrollTo(0, tgt.y);
  }

  clearReturnTarget();
}

/* ------------ main entry ------------ */
export async function renderHome() {
  let root = document.getElementById('app');
  if (!root) {
    root = document.createElement('main');
    root.id = 'app';
    const footer = document.querySelector('footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(root, footer);
    else document.body.appendChild(root);
  }

  // First paint shell (keep it empty to avoid jank)
  root.innerHTML = `
    <section id="home">
      <style>
        /* temporary highlight so users see where they returned */
        .oko-focus-pulse { outline: 3px solid rgba(30,144,255,.45); border-radius: 8px; }
      </style>
      <div class="grid" aria-live="polite"></div>
      <div id="loader" style="display:none;">Loading…</div>
      <div id="sentinel" aria-hidden="true"></div>
    </section>
  `;

  // Reset paging and state
  currentPage = 1;
  allDone = false;
  cachedPosts = [];

  // Load first page
  await loadNextPage(root);
  setupInfiniteScroll(root);

  // If we’re returning from detail, make sure the exact card is visible/focused
  await ensureTargetVisible(root);
}
