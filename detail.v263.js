import { fetchWithRetry, formatDate } from './utils.v263.js';

export default async function renderPost(container, id) {
  container.innerHTML = `<p style="text-align:center;margin-top:2rem;">Loading post...</p>`;

  try {
    const post = await fetchWithRetry(`https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/posts/${id}?_embed`);
    const title = post.title.rendered;
    const author = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
    const date = new Date(post.date);
    const prettyDate = formatDate(date);

    let content = post.content.rendered;

    // ✅ Clean up WordPress caption wrappers and empty placeholders
    content = content
      .replace(/\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/gi, '$1') // remove shortcode remnants
      .replace(/<figcaption[^>]*>[\s\S]*?<\/figcaption>/gi, '') // remove captions
      .replace(/<p>\s*(?:Screenshot|Image|Video)\s*<\/p>/gi, '') // remove "Screenshot" lines
      .replace(/<div[^>]+class="[^"]*(?:mceTemp|wp-block-embed__wrapper)[^"]*"[^>]*><\/div>/gi, '') // empty wrappers
      .replace(/<figure[^>]*>\s*<\/figure>/gi, ''); // empty figures

    // ✅ Render main content safely
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

    // ✅ Auto-unwrap Vimeo links inside anchors
    container.querySelectorAll('a[href*="vimeo.com"]').forEach(a => {
      const iframe = document.createElement('iframe');
      iframe.src = a.href.replace('https://vimeo.com', 'https://player.vimeo.com/video');
      iframe.width = '640';
      iframe.height = '360';
      iframe.frameBorder = '0';
      iframe.allow = 'autoplay; fullscreen';
      iframe.allowFullscreen = true;
      a.replaceWith(iframe);
    });

    // ✅ Remove lingering empty elements
    container.querySelectorAll('p:empty, div:empty, figure:empty').forEach(el => el.remove());
  } catch (err) {
    console.error('[Detail]', err);
    container.innerHTML = `<p style="text-align:center;color:red;">Failed to load post. Please try again later.</p>`;
  }
}
