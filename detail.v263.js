// detail.v263.js  (cache-busted via ?v=264)
import { fetchWithRetry, formatDate } from './utils.v263.js';

export default async function renderPost(container, id) {
  container.innerHTML = `<p style="text-align:center;margin-top:2rem;">Loading post...</p>`;

  try {
    // fetch single post with embeds
    const post = await fetchWithRetry(
      `https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/posts/${id}?_embed`
    );

    const title = post?.title?.rendered ?? 'Untitled';
    const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
    const prettyDate = formatDate(new Date(post.date));

    // raw WP HTML
    let content = post?.content?.rendered || '';

    // ------- CLEANUPS (prevents gray gaps/empty figures) -------
    // caption shortcodes -> unwrap
    content = content.replace(/\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/gi, '$1');
    // remove figcaptions
    content = content.replace(/<figcaption[^>]*>[\s\S]*?<\/figcaption>/gi, '');
    // drop “Screenshot” / “Image” stand-alone labels
    content = content.replace(/<p>\s*(?:Screenshot|Image)\s*<\/p>/gi, '');
    // remove empty wrappers
    content = content
      .replace(/<div[^>]+class="[^"]*(?:mceTemp|wp-block-embed__wrapper)[^"]*"[^>]*>\s*<\/div>/gi, '')
      .replace(/<figure[^>]*>\s*<\/figure>/gi, '');

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

    // convert Vimeo anchors to iframes
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

    // sweep empty elements
    container.querySelectorAll('p:empty, div:empty, figure:empty').forEach(el => el.remove());
  } catch (err) {
    console.error('[Detail]', err);
    container.innerHTML = `
      <p style="text-align:center;color:red;">
        Failed to load post. Please try again later.
      </p>`;
  }
}
