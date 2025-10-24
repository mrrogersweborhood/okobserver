// Home.js — v2025-10-24f
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
  const posts = await getPosts({ per_page: 24, page: 1 });
  const filtered = posts.filter(p => !isCartoon(p));

  const cards = filtered.map(createPostCard);
  const grid = el('section', { class: 'post-grid container' }, ...cards);

  mount.innerHTML = '';
  mount.appendChild(grid);
}
