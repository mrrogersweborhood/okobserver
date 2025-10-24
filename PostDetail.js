// PostDetail.js
// v2025-10-24d

import { el, html, stripTags, decodeHTMLEntities } from './util.js?v=2025-10-24d';
import { getPost } from './api.js?v=2025-10-24d';

function extractVideoSrcFromContent(content) {
  if (!content) return null;
  const txt = content.rendered || content;

  // Existing iframe?
  const iframeMatch = txt.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*><\/iframe>/i);
  if (iframeMatch) return iframeMatch[1];

  // Raw links
  const urlMatch = txt.match(/https?:\/\/[^\s"'<>]+/g);
  if (!urlMatch) return null;

  const first = urlMatch.find(u => /youtube\.com|youtu\.be|vimeo\.com/.test(u));
  if (!first) return null;

  // YouTube
  const yShort = first.match(/youtu\.be\/([A-Za-z0-9_\-]+)/);
  if (yShort) return `https://www.youtube.com/embed/${yShort[1]}`;
  if (/youtube\.com\/watch\?/.test(first)) {
    try {
      const id = new URL(first).searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    } catch {}
  }

  // Vimeo
  const vimeo = first.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  return null;
}

function videoEmbed(src, title = 'Video player') {
  const wrap = el('div', { class: 'video-embed' });
  const iframe = el('iframe', {
    src,
    title,
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    allowfullscreen: 'true',
    loading: 'lazy',
    referrerpolicy: 'no-referrer-when-downgrade',
  });
  wrap.appendChild(iframe);
  return wrap;
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
  return el('div', { class: 'post-hero' }, img);
}

export async function renderPostDetail(root, postId) {
  root.innerHTML = '';

  const page = el('div', { class: 'container post-detail' });
  root.appendChild(page);

  // Back button (top)
  page.appendChild(el('a', { href: '#/', class: 'btn btn-primary back-btn' }, 'Back to Posts'));

  // Fetch the post
  let post;
  try {
    post = await getPost(postId);
  } catch {
    page.appendChild(el('p', { class: 'error' }, 'Unable to load post.'));
    return;
  }
  if (!post) {
    page.appendChild(el('p', { class: 'error' }, 'Post not found.'));
    return;
  }

  // ONE hero (video OR image)
  const videoSrc = extractVideoSrcFromContent(post.content?.rendered);
  const hero = (videoSrc && videoEmbed(videoSrc, stripTags(post.title?.rendered))) || featuredImageBlock(post);
  if (hero) page.appendChild(hero);

  // Title band
  page.appendChild(
    el(
      'div',
      { class: 'post-title-band' },
      html`<h1 class="post-title">${decodeHTMLEntities(post.title?.rendered || '')}</h1>
        <div class="post-byline">
          <span>${stripTags(post._embedded?.author?.[0]?.name || 'Oklahoma Observer')}</span>
          <span aria-hidden="true"> • </span>
          <time datetime="${post.date}">${new Date(post.date).toLocaleDateString()}</time>
        </div>`
    )
  );

  // Body
  const body = el('article', { class: 'post-body' });
  body.innerHTML = decodeHTMLEntities(post.content?.rendered || '');
  page.appendChild(body);

  // Back button (bottom)
  page.appendChild(el('a', { href: '#/', class: 'btn btn-primary back-btn' }, 'Back to Posts'));
}
