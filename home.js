// home.js — Post summary grid with robust cartoon filtering

import {
  fetchLeanPostsPage,
  getCartoonCategoryId,
  pickFeaturedImage,
  fetchAuthorsMap
} from './api.js';

// ---------- config ----------
const PER_PAGE = 6;

// ---------- helpers ----------
function byId(id) { return document.getElementById(id); }

function ensureAppRoot() {
  // Expect a #app content root. If not present, create and append under <main>.
  let root = document.getElementById('app');
  if (!root) {
    const main = document.querySelector('main') || document.body;
    root = document.createElement('div');
    root.id = 'app';
    main.appendChild(root);
  }
  return root;
}

/**
 * Detect whether a post is categorized as "cartoon".
 * We prefer embedded terms (slug/name), and fall back to numeric match if we have an id.
 */
function isCartoonPost(post, cartoonId = 0) {
  // 1) Use embedded term taxonomy (most reliable)
  const terms = (post?._embedded?.['wp:term'] || [])
    .flat()
    .filter(Boolean);

  for (const t of terms) {
    const slug = (t?.slug || '').toLowerCase();
    const name = (t?.name || '').toLowerCase();
    if (slug === 'cartoon' || name === 'cartoon') return true;
  }

  // 2) Fallback: numeric category id
  if (cartoonId && Array.isArray(post?.categories)) {
    if (post.categories.includes(cartoonId)) return true;
  }

  return false;
}

/**
 * Client-side safety filter: strip cartoon posts regardless of server response.
 */
function stripCartoons(posts, cartoonId = 0) {
  if (!Array.isArray(posts)) return [];
  return posts.filter(p => !isCartoonPost(p, cartoonId));
}

/**
 * Render a single card (lean)
 */
function renderCardHTML(post, authorsMap) {
  const title = post?.title?.rendered || '(Untitled)';
  const href = `#/post/${post?.id}`;
  const authorName =
    authorsMap?.get?.(post?.author) ||
    post?._embedded?.author?.[0]?.name ||
    '—';
  const dateISO = post?.date || '';
  const date = new Date(dateISO);
  const dateStr = isFinite(date) ? date.toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric'
  }) : '';

  // Featured or fallback
  const imgSrc = pickFeaturedImage(post);

  // Excerpt (already HTML)
  const excerptHTML = post?.excerpt?.rendered || '';

  // Card markup
  return `
  <article class="card">
    <div class="thumb-wrap">
      ${imgSrc
        ? `<img class="thumb" src="${imgSrc}" alt="" loading="lazy" decoding="async">`
        : `<img class="thumb thumb--placeholder" src="./Observer-Logo-2015-08-05.png" alt="" loading="lazy" decoding="async">`
      }
    </div>
    <h2 class="title"><a href="${href}">${title}</a></h2>
    <div class="meta">By ${authorName}${dateStr ? ` • ${dateStr}` : ''}</div>
    <div class="excerpt">${excerptHTML}</div>
  </article>`;
}

/**
 * Render the grid into #app
 */
function renderGrid(posts, authorsMap) {
  const html = `
    <section class="grid">
      ${posts.map(p => renderCardHTML(p, authorsMap)).join('')}
    </section>
  `;
  byId('app').innerHTML = html;
}

// ---------- paging / load ----------
let loading = false;
let nextPage = 1;
let done = false;

async function loadPageAndRender(reset = false) {
  if (loading || done) return;
  loading = true;

  try {
    if (reset) {
      nextPage = 1;
      done = false;
      byId('app').innerHTML = `<div class="loading">Loading…</div>`;
    }

    // Try to get the cartoon category id (but do not block rendering forever)
    let cartoonId = 0;
    try {
      // A small timeout guard so we still render even if lookup stalls
      const lookup = getCartoonCategoryId();
      cartoonId = await Promise.race([
        lookup,
        new Promise(resolve => setTimeout(() => resolve(0), 3000))
      ]);
    } catch {
      cartoonId = 0;
    }

    // Server-side exclude if we have an id; always filter client-side as safety
    const pageData = await fetchLeanPostsPage(nextPage, { excludeCategoryId: cartoonId });
    let posts = Array.isArray(pageData) ? pageData : [];

    // Safety filter (prevents leaks if server exclude fails)
    posts = stripCartoons(posts, cartoonId);

    if (posts.length === 0) {
      if (nextPage === 1) {
        byId('app').innerHTML = `
          <div class="empty">
            No posts found.
          </div>`;
      } else {
        // No more pages
        done = true;
      }
      loading = false;
      return;
    }

    const authorsMap = await fetchAuthorsMap().catch(() => new Map());

    if (nextPage === 1) {
      renderGrid(posts, authorsMap);
    } else {
      // Append
      const grid = document.querySelector('.grid');
      if (grid) {
        const frag = document.createElement('div');
        frag.innerHTML = posts.map(p => renderCardHTML(p, authorsMap)).join('');
        // Move children out of the wrapper div
        while (frag.firstChild) grid.appendChild(frag.firstChild);
      }
    }

    nextPage += 1;
  } catch (err) {
    console.error('[OkObserver] Home load failed:', err);
    byId('app').innerHTML = `
      <div class="error">Sorry, we couldn’t load posts.</div>`;
    done = true;
  } finally {
    loading = false;
  }
}

// ---------- public entry ----------
export async function renderHome() {
  ensureAppRoot();
  await loadPageAndRender(true);

  // Simple infinite scroll
  const onScroll = () => {
    const nearBottom =
      (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 600);
    if (nearBottom) loadPageAndRender(false);
  };
  window.removeEventListener('scroll', onScroll);
  window.addEventListener('scroll', onScroll, { passive: true });
}
