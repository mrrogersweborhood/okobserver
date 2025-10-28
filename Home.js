// Home.js — v2025-10-27d
// Hardened boot + visible diagnostics. Guarantees first page render, clear errors,
// and robust infinite scroll behavior.

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPosts, getFeaturedImage, isCartoon } from './api.js?v=2025-10-27d';

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

// ------- state persistence -------
const HOME_STATE_KEY = 'okobserver.home.state.v1';
const readState = () => {
  try { const raw = sessionStorage.getItem(HOME_STATE_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
};
const writeState = (state) => { try { sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(state)); } catch {} };
const clearState = () => { try { sessionStorage.removeItem(HOME_STATE_KEY); } catch {} };

// ------- ui helpers -------
function showMessage(mount, msg) {
  const box = el('div', { class: 'container', style: 'margin:1rem 0;color:#6b7280' }, msg);
  mount.appendChild(box);
}
function showError(mount, msg) {
  const box = el('div', { class: 'container error' }, msg);
  mount.appendChild(box);
}

export async function renderHome(mount) {
  // Initial skeleton
  mount.innerHTML = `<div class="loading">Loading posts…</div>`;
  const restored = readState();

  // Internal cursors/flags
  let page = Math.max(1, restored?.page || 1);
  let loading = false;
  let done = false;
  let lastLoadTs = 0;
  let observer = null;
  let pagesTried = 0;    // for diagnostics
  let totalRendered = 0; // count of cards added

  // Track rendered IDs to prevent duplicates
  const renderedIds = new Set();

  // Grid container
  const grid = el('section', { class: 'post-grid container' });
  mount.innerHTML = '';
  mount.appendChild(grid);

  // Save state when navigating to a post
  mount.addEventListener('click', (e) => {
    const a = e.target?.closest?.('a[href^="#/post/"]');
    if (a) writeState({ page, scrollY: window.scrollY });
  });

  async function loadPage() {
    if (loading || done) return;

    const now = performance.now();
    if (now - lastLoadTs < 250) return;
    lastLoadTs = now;

    loading = true;
    pagesTried++;

    try {
      const posts = await getPosts({ per_page: 24, page });

      if (!Array.isArray(posts)) {
        showError(mount, 'Unexpected response while loading posts.');
        done = true;
        return;
      }

      if (posts.length === 0) {
        done = true;
        if (observer) observer.disconnect();
        appendEndCap(totalRendered === 0 ? 'No posts found.' : 'No more posts.');
        return;
      }

      // Filter cartoons + duplicates
      const filtered = posts.filter(p => !isCartoon(p) && !renderedIds.has(p.id));

      // If nothing new after filtering, still advance the page
      if (filtered.length === 0) {
        page++;
        return;
      }

      const frag = document.createDocumentFragment();
      for (const post of filtered) {
        renderedIds.add(post.id);
        frag.appendChild(createPostCard(post));
      }
      grid.appendChild(frag);
      totalRendered += filtered.length;

      page++;
    } catch (e) {
      console.warn('[OkObserver] Home load failed:', e);
      showError(mount, 'Network error while loading posts. Please retry.');
      done = true; // avoid tight loop
    } finally {
      loading = false;
    }
  }

  function appendEndCap(message = 'No more posts.') {
    if (mount.querySelector('#end-cap')) return;
    const cap = el('div', { id: 'end-cap', class: 'end-cap' }, message);
    mount.appendChild(cap);
  }

  // Boot: always try at least the first 2 pages to avoid over-aggressive filtering
  async function boot() {
    let target = page;
    if (page === 1) {
      await loadPage();
      if (totalRendered === 0) await loadPage(); // preemptively try page 2
    } else {
      const saved = page;
      page = 1;
      while (!done && page <= saved) {
        await loadPage();
      }
    }

    // If still nothing after 2 attempts, surface a clear hint for diagnostics
    if (totalRendered === 0) {
      showMessage(mount, 'No posts rendered yet. If this persists, hard-refresh twice and check network connectivity to okobserver-proxy.');
    }

    const sentinel = el('div', { id: 'scroll-sentinel', style: 'height:40px' });
    mount.appendChild(sentinel);

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) loadPage();
        }
      },
      { root: null, rootMargin: '800px 0px', threshold: 0 }
    );
    observer.observe(sentinel);

    // Restore scroll position, if any
    if (restored?.scrollY != null) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, Math.max(0, restored.scrollY));
          clearState();
        });
      });
    }
  }

  await boot();
}
