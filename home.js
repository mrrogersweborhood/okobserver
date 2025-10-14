// home.js v2.65 — post grid
import { fetchWithRetry, fmtDate, stripTags } from './utils.js';

const API = window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

function cardMarkup(p) {
  const title = p?.title?.rendered || '';
  const excerpt = stripTags(p?.excerpt?.rendered || '').slice(0, 220);
  const date = fmtDate(p?.date);
  const media = p?._embedded?.['wp:featuredmedia']?.[0];
  const img = media?.media_details?.sizes?.medium?.source_url || media?.source_url || '';
  const author = p?._embedded?.author?.[0]?.name || '';

  return `
    <article class="post-card">
      <a class="thumb" href="#/post/${p.id}" aria-label="${stripTags(title)}">
        ${img ? `<img loading="lazy" src="${img}" alt="">` : ''}
      </a>
      <h3 class="post-title"><a href="#/post/${p.id}">${title}</a></h3>
      <div class="meta">
        ${author ? `<span class="by">By ${author}</span>` : ''}${date ? ` — <time>${date}</time>` : ''}
      </div>
      ${excerpt ? `<p class="excerpt">${excerpt}</p>` : ''}
    </article>
  `;
}

export default async function renderHome(root) {
  root.innerHTML = `
    <section class="container">
      <h1 class="page-title">Latest Posts</h1>
      <div class="grid" id="grid"></div>
    </section>
  `;

  const grid = root.querySelector('#grid');

  const url = `${API}/posts?status=publish&_embed=1&per_page=18`;
  let data;
  try {
    data = await fetchWithRetry(url);
  } catch (e) {
    grid.innerHTML = `<p>Failed to fetch posts: ${stripTags(e.message || e)}</p>`;
    return;
  }

  grid.innerHTML = data.map(cardMarkup).join('');
}
