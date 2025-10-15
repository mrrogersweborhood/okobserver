// detail.v263.js — clean title, author/date under image, FB/YouTube/Vimeo handling
import { apiFetchJson, prettyDate, extractFirstImage } from './utils.v263.js';

export default async function renderDetail(appEl, id) {
  if (!window.OKO_API_BASE) {
    console.error('[Detail] API base missing.');
    appEl.innerHTML = `<p style="color:#b00">Page error: API base missing.</p>`;
    return;
  }

  appEl.innerHTML = `
    <div class="container" style="max-width:980px;margin:0 auto;padding:0 16px 48px">
      <div id="detail"></div>
    </div>
  `;

  const root = appEl.querySelector('#detail');

  // fetch post
  const url = `${window.OKO_API_BASE}/posts/${id}?_embed=1`;
  let post;
  try {
    post = await apiFetchJson(url);
  } catch (e) {
    console.error('[Detail] fetch failed', e);
    root.innerHTML = `<p style="color:#b00">Failed to load post.</p>`;
    return;
  }

  // data
  const title = post?.title?.rendered || '';
  const html  = post?.content?.rendered || '';
  const authorName =
    (post?._embedded?.author?.[0]?.name) ||
    (post?._embedded?.author?.[0]?.slug) ||
    '—';
  const dateStr = prettyDate(post?.date);

  // Featured media (image or derive from content)
  let featuredHtml = '';
  const media = post?._embedded?.['wp:featuredmedia']?.[0];
  if (media?.source_url) {
    const src = media.source_url;
    const alt = media.alt_text || title.replace(/<[^>]+>/g,'');
    featuredHtml = `
      <figure class="post-figure">
        <img src="${src}" alt="${alt}">
      </figure>
    `;
  } else {
    const imgFromBody = extractFirstImage(html);
    if (imgFromBody) {
      featuredHtml = `
        <figure class="post-figure">
          <img src="${imgFromBody.src}" alt="${imgFromBody.alt || ''}">
        </figure>
      `;
    }
  }

  // Facebook posts (iframe embed) replacement:
  // look for fb post/share links and convert to plugin iframe
  const withFbEmbeds = html.replace(
    /https?:\/\/(?:www\.)?facebook\.com\/[^"<\s]+/gi,
    (href) => {
      // Only convert post/story permalinks; leave generic links alone
      const isPost = /facebook\.com\/[^/]+\/posts|facebook\.com\/[^/]+\/videos|facebook\.com\/watch/.test(href);
      if (!isPost) return href;
      const enc = encodeURIComponent(href);
      return `
        <div style="margin:16px 0">
          <iframe
            src="https://www.facebook.com/plugins/post.php?href=${enc}&show_text=true&width=680"
            width="680" height="420" style="border:none;overflow:hidden;max-width:100%"
            scrolling="no" frameborder="0" allowfullscreen="true"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share">
          </iframe>
        </div>
      `;
    }
  );

  // YouTube & Vimeo click-to-play placeholders
  const processedBody = withFbEmbeds
    // YouTube links -> responsive iframe
    .replace(
      /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_\-]{6,})/gi,
      (_m, id) =>
        `<div style="position:relative;padding-bottom:56.25%;height:0;margin:16px 0">
           <iframe src="https://www.youtube.com/embed/${id}" frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen style="position:absolute;inset:0;width:100%;height:100%"></iframe>
         </div>`
    )
    // Vimeo links -> responsive iframe
    .replace(
      /https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/gi,
      (_m, id) =>
        `<div style="position:relative;padding-bottom:56.25%;height:0;margin:16px 0">
           <iframe src="https://player.vimeo.com/video/${id}" frameborder="0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowfullscreen style="position:absolute;inset:0;width:100%;height:100%"></iframe>
         </div>`
    );

  // Render
  root.innerHTML = `
    <a href="#/" class="btn-back" style="
      display:inline-block;background:#f2f4f7;border:1px solid #e2e5ea;border-radius:8px;
      padding:8px 12px;margin:16px 0 12px;color:#333;text-decoration:none">← Back to Posts</a>

    ${featuredHtml}

    <h1 class="post-title">${title}</h1>

    <p class="post-meta">
      By <span class="post-author">${authorName}</span>
      — <time datetime="${post?.date}">${dateStr}</time>
    </p>

    <article class="post-content">${processedBody}</article>

    <a href="#/" class="btn-back" style="
      display:inline-block;background:#f2f4f7;border:1px solid #e2e5ea;border-radius:8px;
      padding:8px 12px;margin:24px 0 0;color:#333;text-decoration:none">← Back to Posts</a>
  `;
}
