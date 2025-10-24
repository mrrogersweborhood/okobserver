// PostDetail.js
// v2025-10-24c

import { el, html, stripTags, decodeHTMLEntities } from './util.js?v=2025-10-24c';
import { getPost } from './api.js?v=2025-10-24c';

/**
 * Very small helper: tries to detect a youtube/vimeo URL in content and return an embeddable src.
 */
function extractVideoSrcFromContent(content) {
  if (!content) return null;
  const txt = content.rendered || content; // WP gives { rendered }
  // Look for <iframe src="..."> first
  const iframeMatch = txt.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*><\/iframe>/i);
  if (iframeMatch) return iframeMatch[1];

  // Fallback to raw links
  const urlMatch = txt.match(/https?:\/\/[^\s"'<>]+/g);
  if (urlMatch) {
    const first = urlMatch.find(u => /youtube\.com|youtu\.be|vimeo\.com/.test(u));
    if (!first) return null;

    // Normalize YouTube
    if (/youtu\.be\/([A-Za-z0-9_\-\=]+)/.test(first)) {
      const id = first.split('/').pop();
      return `https://www.youtube.com/embed/${id}`;
    }
    if (/youtube\.com\/watch\?/.test(first)) {
      const params = new URL(first).searchParams;
      const id = params.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }

    // Normalize Vimeo
    const vimeoId = first.match(/vimeo\.com\/(\d+)/);
    if (vimeoId) return `https://player.vimeo.com/video/${vimeoId[1]}`;
  }
  return null;
}

/**
 * Create a responsive 16:9 wrapper for iframes
 */
function videoEmbed(src, title = 'Video player') {
  const wrapper = el('div', { class: 'video-embed' });
  const iframe = el('iframe', {
    src,
    title,
    allow:
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    allowfullscreen: 'true',
    loading: 'lazy',
    referrerpolicy: 'no-referrer-when-downgrade',
  });
  wrapper.appendChild(iframe);
  return wrapper;
}

function featuredImageBlock(post) {
  const media = post._embedded?.['wp:featuredmedia']?.[0];
  const url =
    media?.source_url ||
    media?.media_details?.sizes?.large?.source_url ||
    media?.media_details?.sizes?.medium_large?.source_url ||
    media?.media_details?.sizes?.full?.source_url;

  if (!url) return null;

  const img = el('img', {
    src: url,
    alt: stripTags(media?.alt_text) || stripTags(post.title?.rendered) || 'Featured image',
    class: 'post-hero-image',
    loading: 'lazy',
    decoding: 'async',
  });
  const box = el('div', { class: 'post-hero' });
  box.appendChild(img);
  return box;
}

export async function renderPostDetail(root, postId) {
  // Wipe the target clean
  root.innerHTML = '';

  // Container
  const page = el('div', { class: 'container post-detail' });
  root.appendChild(page);

  // Back button top
  const backTop = el(
    'a',
    { href: '#/', class: 'btn btn-primary back-btn' },
    html`<span>Back to Posts</span>`
  );
  page.appendChild(backTop);

  // Fetch
  let post;
  try {
    post = await getPost(postId);
  } catch (e) {
    page.appendChild(el('p', { class: 'error' }, 'Unable to load post.'));
    return;
  }
  if (!post) {
    page.appendChild(el('p', { class: 'error' }, 'Post not found.'));
    return;
  }

  // Decide the one-and-only top media block
  // Priority: video from content → featured image
  const possibleVideo = extractVideoSrcFromContent(post.content?.rendered);
  const hero =
    (possibleVideo && videoEmbed(possibleVideo, stripTags(post.title?.rendered))) ||
    featuredImageBlock(post);

  if (hero) page.appendChild(hero);

  // Title band
  const titleBand = el(
    'div',
    { class: 'post-title-band' },
    html`<h1 class="post-title">${decodeHTMLEntities(post.title?.rendered || '')}</h1>
      <div class="post-byline">
        <span>${stripTags(post._embedded?.author?.[0]?.name || 'Oklahoma Observer')}</span>
        <span aria-hidden="true"> • </span>
        <time datetime="${post.date}">${new Date(post.date).toLocaleDateString()}</time>
      </div>`
  );
  page.appendChild(titleBand);

  // Excerpt (summary page only; here we skip duplicate — you asked for detail only on detail page)
  // If you *do* want a short dek here, uncomment below:
  // if (post.excerpt?.rendered) {
  //   const dek = el('p', { class: 'post-dek' }, decodeHTMLEntities(stripTags(post.excerpt.rendered)));
  //   page.appendChild(dek);
  // }

  // Body
  const body = el('article', { class: 'post-body' });
  body.innerHTML = decodeHTMLEntities(post.content?.rendered || '');
  page.appendChild(body);

  // Back button bottom
  const backBottom = backTop.cloneNode(true);
  page.appendChild(backBottom);
}
