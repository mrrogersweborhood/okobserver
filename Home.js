// Home.js — v2025-10-28a
// Robust boot + safe state handling + infinite scroll + cartoon filter.
// - Ignores/clears empty saved state
// - Saves state only after at least one card rendered
// - Clear diagnostics in UI when fetch fails

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPosts, getFeaturedImage, isCartoon } from './api.js?v=2025-10-28b';

/* ---------- small helpers ---------- */
function toText(html = '') {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').trim();
}
function clamp(str = '', max = 220) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + '…';
}
function showMsg(mount, html, cls = 'container', color = '') {
  const box = el('div', { class: cls, style: color ? `color:${color}` : '' });
  box.innerHTML = html;
  mount.appendChild(box);
}

/* ---------- card ---------- */
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

/* ---------- session state ---------- */
const HOME_STATE_KEY = 'okobserver.home.state.v1';
const readState = () => {
  try {
    const raw = sessionStorage.getItem(HOME_STATE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    // must have a positive page and at least 1 rendered id to be valid
    if (!obj || typeof obj.page !== 'number' || obj.page < 1) return null;
    if (!Array.isArray(obj.ids) || obj.ids.length === 0) return null;
    return obj;
  } catch { return null; }
};
const writeState = (state) => { try { sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(state)); } catch {} };
const clearState = () => { try { sessionStorage.removeItem(HOME_STATE_KEY); } catch {} };

/* ---------- main render ---------- */
export async function renderHome(mount) {
  mount.innerHTML = `<div class="loading">Loading posts…</div>`;

  // UI containers
  const grid = el('section', { class: 'post-grid container' });
  mount.innerHTML = '';
  mount.appendChild(grid);

  // runtime cursors
  let page = 1;
  let loading = false;
  let done = false;
  let lastLoadTs = 0;
  let observer = null;

  // bookkeeping
  const renderedIds = new Set();
  let totalRendered = 0;
  let hasRenderedAny = false; // gate for saving state

  // restore (only if truly valid)
  const saved = readState();
  if (saved) {
    page = Math.max(1, saved.page);
    // We don't re-create all cards from saved (keeps code simple + robust).
    // We only use it to restore scroll later.
  } else {
    clearState();
  }

  // Only save state after we've rendered at least one card
  function saveStateIfReady() {
    if (!hasRenderedAny) return;
    writeState({ page, scrollY: window.scrollY, ids: Array.from(renderedIds) });
  }

  mount.addEventListener('click', (e) => {
    const a = e.target?.closest?.('a[href^="#/post/"]');
    if (a) saveStateIfReady();
  });

  async function loadPage() {
    if (loading || done) return;

    const now = performance.now();
    if (now - lastLoadTs < 200) return; // throttle a bit
    lastLoadTs = now;

    loading = true;
    try {
      const posts = await getPosts({ per_page: 24, page });

      if (!Array.isArray(posts)) {
        showMsg(mount, 'Unexpected response while loading posts.', 'container error', '#b91c1c');
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

      // Even if everything filtered out, advance the page so we don’t get stuck
      const frag = document.createDocumentFragment();
      for (const post of filtered) {
        renderedIds.add(post.id);
        frag.appendChild(createPostCard(post));
      }
      if (filtered.length > 0) {
        grid.appendChild(frag);
        totalRendered += filtered.length;
        hasRenderedAny = true;
      }

      page++;
    } catch (e) {
      console.warn('[OkObserver] Home load failed:', e);
      showMsg(mount, 'Network error while loading posts. Please retry.', 'container error', '#b91c1c');
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

  async function boot() {
    // Always start fresh on first render attempt
    clearState();

    // Try first two pages to outpace aggressive filtering
    await loadPage();
    if (totalRendered === 0) await loadPage();

    if (totalRendered === 0) {
      showMsg(mount,
        'No posts rendered yet. If this persists, hard-refresh twice and check connectivity to okobserver-proxy.',
        'container', '#6b7280'
      );
    }

    // sentinel for infinite scroll
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

    // If we had a valid saved scroll, restore now.
    if (saved?.scrollY != null) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, Math.max(0, saved.scrollY));
        });
      });
    }

    // Save state on unload if we actually rendered content
    window.addEventListener('pagehide', saveStateIfReady, { once: true });
    window.addEventListener('beforeunload', saveStateIfReady, { once: true });
  }

  await boot();
}
