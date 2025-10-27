// Home.js — v2025-10-24i (adds infinite scroll)
// Layout: Title → Byline → Excerpt on cards; filters out 'cartoon' category
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
  // Teardown any prior infinite-scroll listener
  if (window._okobsScrollHandler) {
    window.removeEventListener('scroll', window._okobsScrollHandler);
    window._okobsScrollHandler = null;
  }

  // Reset paging flags at entry to Home
  window._okobsPage = 1;
  window._okobsLoading = false;

  // Initial fetch
  const posts = await getPosts({ per_page: 24, page: window._okobsPage });
  const filtered = posts.filter(p => !isCartoon(p));
  const cards = filtered.map(createPostCard);

  const grid = el('section', { class: 'post-grid container' }, ...cards);
  mount.innerHTML = '';
  mount.appendChild(grid);

  // Infinite scroll (append-only)
  const onScroll = async () => {
    // If navigated away or grid missing, stop listening
    const gridNode = document.querySelector('.post-grid');
    if (!gridNode || !location.hash || location.hash.startsWith('#/post') || location.hash.startsWith('#/about') || location.hash.startsWith('#/settings')) {
      window.removeEventListener('scroll', onScroll);
      window._okobsScrollHandler = null;
      return;
    }

    if (window._okobsLoading) return;
    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.body.offsetHeight - 600;

    if (scrollPosition >= threshold) {
      window._okobsLoading = true;
      try {
        window._okobsPage += 1;
        const more = await getPosts({ per_page: 24, page: window._okobsPage });
        const moreFiltered = more.filter(p => !isCartoon(p));
        if (moreFiltered.length === 0) {
          // No more results; stop listening
          window.removeEventListener('scroll', onScroll);
          window._okobsScrollHandler = null;
          return;
        }
        const newCards = moreFiltered.map(createPostCard);
        newCards.forEach(card => gridNode.appendChild(card));
      } catch (e) {
        console.warn('[OkObserver] Infinite scroll halted:', e);
      } finally {
        window._okobsLoading = false;
      }
    }
  };

  window._okobsScrollHandler = onScroll;
  window.addEventListener('scroll', onScroll, { passive: true });
}
