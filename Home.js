// Home.js — v2025-10-24e
import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPosts, getFeaturedImage, isCartoon } from './api.js?v=2025-10-24e';

// Local helper to extract plain text from WP-rendered HTML
function toText(html = '') {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').trim();
}

// Clamp excerpt to a readable length
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

  // Use WP excerpt if present; otherwise derive from content (fallback)
  const rawExcerpt = post.excerpt?.rendered || post.content?.rendered || '';
  const excerpt    = clamp(toText(rawExcerpt));

  return el('article', { class: 'card' },
    el('a', { href, class: 'card-media' },
      imgUrl
        ? el('img', { src: imgUrl, alt: title, loading: 'lazy' })
        : el('div', { class: 'media-fallback' }, 'No image')
    ),
    el('div', { class: 'card-body' },
      el('h3', { class: 'card-title' }, el('a', { href }, title)),
      // Excerpt line
      excerpt ? el('p', { class: 'post-excerpt' }, excerpt) : null,
      // Meta line: author • date
      el('div', { class: 'meta' }, `${author} • ${date}`)
    )
  );
}

export async function renderHome(mount) {
  // Load posts
  const posts = await getPosts({ per_page: 24, page: 1 });

  // Filter out "cartoon" posts
  const filtered = posts.filter(p => !isCartoon(p));

  const cards = filtered.map(createPostCard);
  const grid  = el('section', { class: 'post-grid container' }, ...cards);

  mount.innerHTML = '';
  mount.appendChild(grid);
}
