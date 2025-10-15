/*
  OkObserver Post Detail (v2.6.5)
  - Renders single post by ID
  - Back to Posts (top & bottom)
  - Featured image (if any)
  - Cleans quirky markup from WP
  - Leaves safe embeds (iframe/video) intact
*/

import { fetchWithRetry } from './utils.js';
import { formatDate, decodeHTML } from './utils.js';

export default async function renderDetail(app, id) {
  const mount = app || document.getElementById('app');
  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp/v2';

  if (!API_BASE) {
    console.error('[Detail] API base missing.');
    mount.innerHTML = `<p>Page error: API base missing.</p>`;
    return;
  }

  // Skeleton while fetching
  mount.innerHTML = `
    <a class="ok-back" href="#/">← Back to Posts</a>
    <div class="ok-post ok-elevated">
      <div class="ok-post__head"><h1 class="ok-title">Loading…</h1></div>
      <div class="ok-post__body"><p>Please wait…</p></div>
    </div>
  `;

  try {
    // 1) Load the post (with embeds for author/media)
    const post = await fetchWithRetry(
      `${API_BASE}/posts/${id}?_embed=1`,
      3
    );

    // Guard
    if (!post || !post.id) {
      mount.innerHTML = `
        <a class="ok-back" href="#/">← Back to Posts</a>
        <p>Page error: post not found.</p>`;
      return;
    }

    // 2) Collect display fields
    const title  = decodeHTML(post.title?.rendered || '');
    const date   = formatDate(post.date);
    const author = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';

    const featured =
      post._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';

    // 3) Clean & prepare content
    //    - Keep iframes/video/img/figure/figcaption
    //    - Strip “mceTemp” and empty image placeholders
    const raw = String(post.content?.rendered || '');

    const cleaned = raw
      // Remove the tiny WP "mceTemp" placeholders and empty figs
      .replace(/<div[^>]*class=["'][^"']*mceTemp[^"']*["'][^>]*>.*?<\/div>/gis, '')
      .replace(/<figure[^>]*>\s*<\/figure>/gis, '')
      // Remove empty captions and images with no src
      .replace(/<img[^>]*src=["']\s*["'][^>]*>/gis, '')
      .replace(/<figcaption>\s*<\/figcaption>/gis, '')
      // Lightly sanitize scripts
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gis, '');

    // 4) Render
    mount.innerHTML = `
      <a class="ok-back" href="#/">← Back to Posts</a>

      <article class="ok-post ok-elevated">
        <header class="ok-post__head">
          <h1 class="ok-title">${title}</h1>
          <p class="ok-meta">By ${author} — ${date}</p>
        </header>

        ${featured ? `
          <div class="ok-hero">
            <img class="ok-hero__img" src="${featured}" alt="${title}" loading="lazy">
          </div>` : ''}

        <div class="ok-post__body ok-content">
          ${cleaned}
        </div>

        <footer class="ok-post__foot">
          <a class="ok-back" href="#/">← Back to Posts</a>
        </footer>
      </article>
    `;

    // 5) Optional polish: make external links open in new tab safely
    for (const a of mount.querySelectorAll('.ok-content a[href]')) {
      const href = a.getAttribute('href') || '';
      const isHash = href.startsWith('#');
      if (!isHash && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      }
    }

  } catch (err) {
    console.error('[Detail] load failed:', err);
    mount.innerHTML = `
      <a class="ok-back" href="#/">← Back to Posts</a>
      <p>Page error: ${decodeHTML(err.message || 'Unknown error')}</p>
    `;
  }
}
