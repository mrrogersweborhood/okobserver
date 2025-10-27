// Home.js — v2025-10-27c
// Infinite scroll hardened: earlier trigger, strict request lock, idempotent render,
// scroll-position persistence, graceful completion.
// NOTE: Update your dynamic import in main.js to ?v=2025-10-27c to bust caches.

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPosts, getFeaturedImage, isCartoon } from './api.js?v=2025-10-24e';

// ------- helpers -------
function toText(html = '') {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').trim();
}

function clamp(str = '', max = 220) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + '…';
}

function createPostCard(post) {
  const href   = `#/post/${post.id}`;
  const imgUrl = getFeaturedImage(post);
  const title  = decodeHTML(post.title?.rendered || 'Untitled');
  const date   = formatDate(post.date);
  const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const rawExcerpt = post.excerpt?.rendered || post.content?.rendered || '';
  const excerpt = clamp(toText(rawExcerpt));

  return el('article', { class: 'card' },
    el('a', { href, class: 'card-media' },
      imgUrl
        ? el('img', { src: imgUrl, alt: title, loading: 'lazy' })
        : el('div', { class: 'media-fallback' }, 'No image')
    ),
    el('div', { class: 'card-body' },
      el('h3', { class: 'card-title' }, el('a', { href }, title)),
      el('div', { class: 'meta' }, `${author} • ${date}`),
      excerpt ? el('p', { class: 'post-excerpt' }, excerpt) : null
    )
  );
}

// ------- state persistence (for back/forward to preserve scroll) -------
const HOME_STATE_KEY = 'okobserver.home.state.v1';

// Safely parse JSON
function readState() {
  try {
    const raw = sessionStorage.getItem(HOME_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeState(state) {
  try {
    sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(state));
  } catch { /* ignore quota/errors */ }
}

function clearState() {
  try {
    sessionStorage.removeItem(HOME_STATE_KEY);
  } catch { /* ignore */ }
}

export async function renderHome(mount) {
  // Initial skeleton
  mount.innerHTML = `<div class="loading">Loading posts…</div>`;

  // Restore state if returning from a post
  const restored = readState();
  // Internal cursors/flags
  let page = Math.max(1, restored?.page || 1);
  let loading = false;
  let done = false;
  let lastLoadTs = 0;
  let observer = null;

  // Track rendered IDs to prevent duplicates
  const renderedIds = new Set();

  // Grid container
  const grid = el('section', { class: 'post-grid container' });
  mount.innerHTML = '';
  mount.appendChild(grid);

  // Save state when navigating to a post (delegated on mount)
  mount.addEventListener('click', (e) => {
    const a = e.target?.closest?.('a[href^="#/post/"]');
    if (a) {
      writeState({ page: page - 0, scrollY: window.scrollY });
    }
  });

  async function loadPage() {
    if (loading || done) return;

    // simple debounce: ignore requests fired <250ms apart
    const now = performance.now();
    if (now - lastLoadTs < 250) return;
    lastLoadTs = now;

    loading = true;
    try {
      const posts = await getPosts({ per_page: 24, page });
      // If API returns empty array, mark done.
      if (!Array.isArray(posts) || posts.length === 0) {
        done = true;
        if (observer) observer.disconnect();
        appendEndCap();
        return;
      }

      // Filter: remove cartoons + already-rendered IDs
      const filtered = posts.filter(
        (p) => !isCartoon(p) && !renderedIds.has(p.id)
      );

      // If nothing new after filtering, we still advance the page
      if (filtered.length === 0) {
        page++;
        return;
      }

      // Append cards + record IDs
      const frag = document.createDocumentFragment();
      for (const post of filtered) {
        renderedIds.add(post.id);
        frag.appendChild(createPostCard(post));
      }
      grid.appendChild(frag);

      page++;
    } catch (e) {
      console.warn('[OkObserver] Infinite scroll failed:', e);
      // Stop further attempts to avoid tight error loop
      done = true;
      appendEndCap('Something went wrong loading more posts.');
    } finally {
      loading = false;
    }
  }

  function appendEndCap(message = 'No more posts.') {
    // Add a gentle footer message only once
    if (mount.querySelector('#end-cap')) return;
    const cap = el('div', { id: 'end-cap', class: 'end-cap' }, message);
    mount.appendChild(cap);
  }

  // Boot: if we have a saved page, load up to that page before restoring scroll
  async function boot() {
    // Always load at least one page
    if (page === 1) {
      await loadPage();
    } else {
      // Load pages 1..restored.page
      const target = page;
      page = 1;
      while (!done && page <= target) {
        await loadPage();
      }
    }

    // Create sentinel & observer after initial content is in place
    const sentinel = el('div', { id: 'scroll-sentinel', style: 'height:40px' });
    mount.appendChild(sentinel);

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // Queue exactly one load (lock prevents overlap)
            loadPage();
          }
        }
      },
      {
        root: null,
        // Earlier trigger so users rarely see a hard stop near the bottom
        rootMargin: '800px 0px',
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    // Restore scroll position if we have it
    if (restored?.scrollY != null) {
      // Two RAFs ensures layout is painted before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, Math.max(0, restored.scrollY));
          // Clear once we’ve restored
          clearState();
        });
      });
    }
  }

  await boot();
}
