// home.js v2.65-stable — restores 4-col grid, titles, author, pretty date, excerpt
import { fetchWithRetry, fmtDate, stripTags } from './utils.js';

const API = window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

function cardMarkup(p) {
  const title = p?.title?.rendered || '';
  const excerpt = stripTags(p?.excerpt?.rendered || '').slice(0, 240);
  const date = fmtDate(p?.date);
  const media = p?._embedded?.['wp:featuredmedia']?.[0];
  const img =
    media?.media_details?.sizes?.medium_large?.source_url ||
    media?.media_details?.sizes?.medium?.source_url ||
    media?.source_url ||
    '';
  const author = p?._embedded?.author?.[0]?.name || '';

  return `
    <article class="card">
      <a class="card__thumb" href="#/post/${p.id}" aria-label="${stripTags(title)}">
        ${img ? `<img loading="lazy" src="${img}" alt="">` : ''}
      </a>

      <h3 class="card__title">
        <a href="#/post/${p.id}">${title}</a>
      </h3>

      <div class="card__meta">
        ${author ? `<span class="card__by">By ${author}</span>` : ''}
        ${date ? `<span class="card__dot">•</span> <time>${date}</time>` : ''}
      </div>

      ${excerpt ? `<p class="card__excerpt">${excerpt}</p>` : ''}
    </article>
  `;
}

export default async function renderHome(root) {
  // Keep container + grid class names your CSS expects
  root.innerHTML = `
    <section class="container">
      <h1 class="page-title">Latest Posts</h1>
      <div class="posts-grid" id="postsGrid" aria-live="polite"></div>
    </section>
  `;

  const grid = root.querySelector('#postsGrid');

  // Use the worker; fetch posts + embeds for author/media
  const url = `${API}/posts?status=publish&_embed=1&per_page=18`;

  try {
    const items = await fetchWithRetry(url);
    grid.innerHTML = items.map(cardMarkup).join('');
  } catch (e) {
    grid.innerHTML = `<p class="page-error">Failed to fetch posts: ${stripTags(e.message || e)}</p>`;
  }
}
