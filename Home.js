// Home.js — v2025-10-24e
import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPosts, getFeaturedImage, isCartoon } from './api.js?v=2025-10-24e';

export async function renderHome(mount) {
  const posts = await getPosts({ per_page: 24, page: 1 });

  // Filter out "cartoon" posts
  const filtered = posts.filter(p => !isCartoon(p));

  const grid = el('section', { class: 'post-grid container' },
    ...filtered.map(p => {
      const href = `#/post/${p.id}`;
      const img = getFeaturedImage(p);
      const title = decodeHTML(p.title?.rendered || 'Untitled');
      const date = formatDate(p.date);

      return el('article', { class: 'card' },
        el('a', { href, class: 'card-media' },
          img
            ? el('img', { src: img, alt: title, loading: 'lazy' })
            : el('div', { class: 'media-fallback' }, 'No image')
        ),
        el('div', { class: 'card-body' },
          el('h3', { class: 'card-title' }, el('a', { href }, title)),
          el('div', { class: 'meta' }, date)
        )
      );
    })
  );

  mount.innerHTML = '';
  mount.appendChild(grid);
}
