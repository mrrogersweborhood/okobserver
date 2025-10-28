// Home.js — v2025-10-28b
// Performance optimized: 12-post batches, async image decode, idle prefetch.

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPosts, getFeaturedImage, isCartoon } from './api.js?v=2025-10-28d';

function toText(html = '') { const d = document.createElement('div'); d.innerHTML = html; return (d.textContent || '').trim(); }
function clamp(s = '', n = 220) { return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'; }

function createPostCard(post, idx = 0) {
  const href = `#/post/${post.id}`;
  const imgUrl = getFeaturedImage(post);
  const title = decodeHTML(post.title?.rendered || 'Untitled');
  const date = formatDate(post.date);
  const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const rawExcerpt = post.excerpt?.rendered || post.content?.rendered || '';
  const excerpt = clamp(toText(rawExcerpt));
  const priority = idx < 4 ? 'high' : 'low';

  return el('article', { class: 'card' },
    el('a', { href, class: 'card-media' },
      imgUrl
        ? el('img', { src: imgUrl, alt: title, loading: 'lazy', decoding: 'async', fetchpriority: priority })
        : el('div', { class: 'media-fallback' }, 'No image')
    ),
    el('div', { class: 'card-body' },
      el('h3', { class: 'card-title' }, el('a', { href }, title)),
      el('div', { class: 'meta' }, `${author} • ${date}`),
      excerpt ? el('p', { class: 'post-excerpt' }, excerpt) : null
    )
  );
}

const HOME_STATE_KEY = 'okobserver.home.state.v1';
const readState = () => { try { const r = sessionStorage.getItem(HOME_STATE_KEY); const o = r && JSON.parse(r); if (o && o.page > 0 && Array.isArray(o.ids) && o.ids.length) return o; } catch {} return null; };
const writeState = (s) => { try { sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(s)); } catch {} };
const clearState = () => { try { sessionStorage.removeItem(HOME_STATE_KEY); } catch {} };

export async function renderHome(mount) {
  mount.innerHTML = '';
  const grid = el('section', { class: 'post-grid container' });
  mount.appendChild(grid);

  let page = 1, loading = false, done = false, observer = null;
  const renderedIds = new Set();
  let totalRendered = 0, hasRenderedAny = false;

  const saved = readState(); if (!saved) clearState();
  const saveStateIfReady = () => { if (hasRenderedAny) writeState({ page, scrollY: window.scrollY, ids: Array.from(renderedIds) }); };
  mount.addEventListener('click', e => { const a = e.target?.closest?.('a[href^="#/post/"]'); if (a) saveStateIfReady(); });

  async function loadPage() {
    if (loading || done) return;
    loading = true;
    try {
      const posts = await getPosts({ page, per_page: 12 });
      if (!Array.isArray(posts) || posts.length === 0) {
        done = true;
        if (observer) observer.disconnect();
        appendEndCap(totalRendered === 0 ? 'No posts found.' : 'No more posts.');
        return;
      }
      const filtered = posts.filter(p => !renderedIds.has(p.id) && !isCartoon(p));
      const frag = document.createDocumentFragment();
      filtered.forEach((p, i) => {
        renderedIds.add(p.id);
        frag.appendChild(createPostCard(p, i));
      });
      if (filtered.length) {
        grid.appendChild(frag);
        totalRendered += filtered.length;
        hasRenderedAny = true;
      }
      page++;
      // idle prefetch next page
      const prefetch = () => getPosts({ page, per_page: 12 }).catch(()=>{});
      if ('requestIdleCallback' in window) requestIdleCallback(prefetch, { timeout: 1500 });
      else setTimeout(prefetch, 600);
    } catch (e) {
      console.warn('[OkObserver] Home load failed:', e);
      showError('Network error while loading posts. Please retry.');
      done = true;
    } finally { loading = false; }
  }

  function showError(text) {
    const box = el('div', { class: 'container error', style: 'color:#b91c1c' }, text);
    mount.prepend(box);
  }
  function appendEndCap(msg) {
    if (mount.querySelector('#end-cap')) return;
    mount.appendChild(el('div', { id: 'end-cap', class: 'end-cap' }, msg));
  }

  clearState();
  await loadPage();
  if (totalRendered < 6) await loadPage();

  const sentinel = el('div', { id: 'scroll-sentinel', style: 'height:40px' });
  mount.appendChild(sentinel);
  observer = new IntersectionObserver(ents => ents.some(e => e.isIntersecting) && loadPage(), { rootMargin: '800px 0px', threshold: 0 });
  observer.observe(sentinel);

  if (saved?.scrollY != null) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, Math.max(0, saved.scrollY))));

  window.addEventListener('pagehide', saveStateIfReady, { once: true });
  window.addEventListener('beforeunload', saveStateIfReady, { once: true });
}
