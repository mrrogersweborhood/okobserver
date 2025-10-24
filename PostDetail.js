// PostDetail.js — v2025-10-24e
import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPost, extractMediaFromContent, getFeaturedImage } from './api.js?v=2025-10-24e';

function backButton() {
  return el('a', { href: '#/', class: 'btn btn-primary back-btn' }, 'Back to Posts');
}

export async function renderPost(mount, id) {
  // Basic loading state
  if (mount) mount.innerHTML = '<div class="loading">Loading…</div>';

  // Fetch the post
  const post = await getPost(id);

  // Core fields
  const title  = decodeHTML(post.title?.rendered || 'Untitled');
  const date   = formatDate(post.date);
  const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';

  // Choose ONE hero: prefer embedded video; else featured image; else quiet fallback
  const videoSrc = extractMediaFromContent(post.content?.rendered || '');
  const feat     = getFeaturedImage(post);

  const media = el('div', { class: 'hero-media container' },
    videoSrc
      ? el('div', { class: 'video-wrap' },
          el('iframe', {
            src: videoSrc,
            allowfullscreen: true,
            frameborder: '0',
            loading: 'lazy',
            referrerpolicy: 'no-referrer-when-downgrade'
          })
        )
      : (feat
          ? el('figure', { class: 'hero-image' },
              el('img', { src: feat, alt: title })
            )
          : el('div', { class: 'media-fallback' }, '')
        )
  );

  // Title + byline
  const header = el('header', { class: 'post-header container' },
    el('h1', { class: 'post-title' }, title),
    el('div', { class: 'post-byline' }, `${author} • ${date}`),
    el('div', { class: 'byline-divider' })
  );

  // Article body (rendered HTML from WP)
  const article = el('article', { class: 'post-body container' });
  article.innerHTML = post.content?.rendered || '';

  // Back buttons
  const topBack    = el('div', { class: 'container back-top' }, backButton());
  const bottomBack = el('div', { class: 'container back-bottom' }, backButton());

  // Mount
  mount.innerHTML = '';
  mount.append(media, topBack, header, article, bottomBack);
}
