/*
  OkObserver Home Page (v2.6.5)
  - Displays latest posts in 4-column grid
  - Filters out cartoons
  - Clickable titles & featured images
  - Handles infinite scroll gracefully
*/

import { fetchWithRetry } from './utils.js';
import { formatDate, decodeHTML } from './utils.js';

export default async function renderHome() {
  const app = document.getElementById('app');
  app.innerHTML = `<h2>Latest Posts</h2><div id="postGrid" class="ok-grid"></div>`;

  const grid = document.getElementById('postGrid');
  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp/v2';

  if (!API_BASE) {
    console.error('[Home] API base missing.');
    app.innerHTML = `<p>Page error: API base missing.</p>`;
    return;
  }

  try {
    console.log('[OkObserver] Loading posts from', API_BASE);
    let page = 1;
    let loading = false;
    let totalLoaded = 0;

    async function loadPosts() {
      if (loading) return;
      loading = true;

      try {
        const posts = await fetchWithRetry(
          `${API_BASE}/posts?_embed&per_page=12&page=${page}`,
          3
        );

        if (!Array.isArray(posts) || posts.length === 0) {
          console.warn('[Home] No posts found.');
          if (page === 1) grid.innerHTML = `<p>No posts available.</p>`;
          return;
        }

        // Filter out cartoons
        const filtered = posts.filter(
          p =>
            !p._embedded['wp:term'][0].some(cat =>
              ['cartoon', 'cartoons'].includes(cat.slug.toLowerCase())
            )
        );

        // Render posts
        for (const post of filtered) {
          const title = decodeHTML(post.title.rendered);
          const excerpt = decodeHTML(
            post.excerpt.rendered.replace(/<[^>]+>/g, '')
          );
          const date = formatDate(post.date);
          const author =
            post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
          const media =
            post._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';

          const card = document.createElement('article');
          card.className = 'ok-card';
          card.innerHTML = `
            <a href="#/post/${post.id}">
              ${
                media
                  ? `<img class="ok-thumb" src="${media}" alt="${title}" loading="lazy">`
                  : ''
              }
            </a>
            <div class="ok-body">
              <h3 class="ok-title">
                <a href="#/post/${post.id}">${title}</a>
              </h3>
              <p class="ok-meta">By ${author} — ${date}</p>
              <p class="ok-excerpt">${excerpt}</p>
            </div>
          `;
          grid.appendChild(card);
        }

        totalLoaded += filtered.length;
        page++;
        loading = false;
      } catch (err) {
        console.error('[Home] load failed:', err);
        app.innerHTML = `<p>Failed to fetch posts.</p>`;
      }
    }

    // Load first batch
    await loadPosts();

    // Infinite scroll
    window.onscroll = async () => {
      const bottom =
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;
      if (bottom && !loading) {
        await loadPosts();
      }
    };
  } catch (err) {
    console.error('[Home] render failed:', err);
    app.innerHTML = `<p>Page error: ${err.message}</p>`;
  }
}
