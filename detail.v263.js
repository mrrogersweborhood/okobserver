// detail.v263.js — Detail view with video + WP cleanup (v=265)
// Keeps filename as-is; we just bust cache with ?v=265 from the router.

import { fetchWithRetry, formatDate } from './utils.js';

export default async function renderPost(container, id) {
  container.innerHTML = `<p style="text-align:center;margin-top:2rem;">Loading post...</p>`;

  try {
    // Fetch post with embeds via your Cloudflare Worker
    const post = await fetchWithRetry(
      `https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/posts/${id}?_embed`
    );

    const title = post?.title?.rendered ?? 'Untitled';
    const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
    const prettyDate = formatDate(new Date(post.date));

    // Raw WP HTML
    let content = post?.content?.rendered || '';

    // ------- WordPress cleanup to remove gray placeholder blocks -------
    // 1) [caption]…[/caption] -> unwrap content
    content = content.replace(/\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/gi, '$1');

    // 2) Remove figcaptions (we render cleaner without them)
    content = content.replace(/<figcaption[^>]*>[\s\S]*?<\/figcaption>/gi, '');

    // 3) Remove one-word placeholder paragraphs
    content = content.replace(/<p>\s*(?:Screenshot|Image|Video)\s*<\/p>/gi, '');

    // 4) Remove empty wrappers that become gray boxes
    content = content
      .replace(/<div[^>]+class="[^"]*(?:mceTemp|wp-block-embed__wrapper)[^"]*"[^>]*>\s*<\/div>/gi, '')
      .replace(/<figure[^>]*>\s*<\/figure>/gi, '');

    // Render page
    container.innerHTML = `
      <article class="post-detail">
        <a href="#/" class="back-link">← Back to Posts</a>
        <h1>${title}</h1>
        <p class="meta">By ${author} — ${prettyDate}</p>
        <div class="post-content">${content}</div>
        <div class="back-bottom">
          <a href="#/" class="back-link">← Back to Posts</a>
        </div>
      </article>
    `;

    // Convert plain Vimeo links into playable iframes (when editor saved a link+image instead of an embed)
    container.querySelectorAll('a[href*="vimeo.com"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const vid = href.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
      if (!vid) return;

      const iframe = document.createElement('iframe');
      iframe.src = `https://player.vimeo.com/video/${vid}`;
      iframe.width = '640';
      iframe.height = '360';
      iframe.frameBorder = '0';
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.allowFullscreen = true;

      a.replaceWith(iframe);
    });

    // Final sweep for accidental empties
    container.querySelectorAll('p:empty, div:empty, figure:empty').forEach(el => el.remove());
  } catch (err) {
    console.error('[Detail]', err);
    container.innerHTML = `
      <p style="text-align:center;color:red;">
        Failed to load post. Please try again later.
      </p>`;
  }
}
