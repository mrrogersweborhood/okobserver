// home.js v2.65-filter-cartoons
import { fetchWithRetry, fmtDate, stripTags } from './utils.js';

const API = window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

// Slugs we treat as “cartoons” no matter how they’re named in WP
const CARTOON_LIKE_SLUGS = [
  'cartoon', 'cartoons', 'editorial-cartoon', 'editorial-cartoons',
  'political-cartoon', 'political-cartoons'
];

async function resolveCartoonCategoryIds() {
  // Try exact slugs first (fast path)
  const slugQuery = CARTOON_LIKE_SLUGS.map(s => `slug=${encodeURIComponent(s)}`).join('&');
  let cats = [];
  try {
    const bySlug = await fetchWithRetry(`${API}/categories?per_page=100&${slugQuery}`);
    cats = cats.concat(bySlug || []);
  } catch {}

  // Also search by name (safety for sites where slugs differ)
  try {
    const search = await fetchWithRetry(`${API}/categories?per_page=100&search=cartoon`);
    cats = cats.concat(search || []);
  } catch {}

  // Unique IDs only
  const ids = Array.from(new Set(cats.map(c => c.id).filter(Boolean)));
  return ids;
}

function cardMarkup(p) {
  const title = p?.title?.rendered || '';
  const excerpt = stripTags(p?.excerpt?.rendered || '').slice(0, 220);
  const date = fmtDate(p?.date);
  const media = p?._embedded?.['wp:featuredmedia']?.[0];
  const img =
    media?.media_details?.sizes?.medium_large?.source_url ||
    media?.media_details?.sizes?.medium?.source_url ||
    media?.source_url || '';
  const author = p?._embedded?.author?.[0]?.name || '';

  return `
    <article class="card">
      <a class="card__thumb" href="#/post/${p.id}" aria-label="${stripTags(title)}">
        ${img ? `<img loading="lazy" src="${img}" alt="">` : ''}
      </a>

      <h3 class="card__title"><a href="#/post/${p.id}">${title}</a></h3>

      <div class="card__meta">
        ${author ? `<span class="card__by">By ${author}</span>` : ''}
        ${date ? `<span class="card__dot">•</span> <time>${date}</time>` : ''}
      </div>

      ${excerpt ? `<p class="card__excerpt">${excerpt}</p>` : ''}
    </article>
  `;
}

export default async function renderHome(root) {
  root.innerHTML = `
    <section class="container">
      <h1 class="page-title">Latest Posts</h1>
      <div class="posts-grid" id="postsGrid" aria-live="polite"></div>
    </section>
  `;
  const grid = root.querySelector('#postsGrid');

  // Build posts URL, excluding cartoons if we can resolve IDs
  let urlBase = `${API}/posts?status=publish&_embed=1&per_page=18`;
  try {
    const excludeIds = await resolveCartoonCategoryIds();
    if (excludeIds.length) {
      const exclude = excludeIds.map(id => `categories_exclude=${id}`).join('&');
      urlBase += `&${exclude}`;
    }
  } catch {
    // If we can’t resolve, we still fetch posts (safest behavior)
  }

  try {
    const items = await fetchWithRetry(urlBase);
    grid.innerHTML = items.map(cardMarkup).join('');
  } catch (e) {
    grid.innerHTML = `<p class="page-error">Failed to fetch posts: ${stripTags(e.message || e)}</p>`;
  }
}
