// Home.js — v2025-10-27b
// Infinite scroll via IntersectionObserver
import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPosts, getFeaturedImage, isCartoon } from './api.js?v=2025-10-24e';

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

export async function renderHome(mount) {
  mount.innerHTML = `<div class="loading">Loading posts…</div>`;
  let page = 1;
  let loading = false;
  let done = false;

  const grid = el('section', { class: 'post-grid container' });
  mount.innerHTML = '';
  mount.appendChild(grid);

  async function loadPage() {
    if (loading || done) return;
    loading = true;
    try {
      const posts = await getPosts({ per_page: 24, page });
      const filtered = posts.filter(p => !isCartoon(p));
      if (filtered.length === 0) {
        done = true;
        observer.disconnect();
        return;
      }
      const cards = filtered.map(createPostCard);
      cards.forEach(card => grid.appendChild(card));
      page++;
    } catch (e) {
      console.warn('[OkObserver] Infinite scroll failed:', e);
      done = true;
    } finally {
      loading = false;
    }
  }

  await loadPage();

  const sentinel = el('div', { id: 'scroll-sentinel', style: 'height:40px' });
  mount.appendChild(sentinel);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) loadPage();
    });
  }, { rootMargin: '400px' });

  observer.observe(sentinel);
}
