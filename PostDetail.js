// PostDetail.js — v2025-10-24e (hero video overlay + body de-dup)
import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPost, extractMediaFromContent, getFeaturedImage } from './api.js?v=2025-10-24e';

function backButton() {
  return el('a', { href: '#/', class: 'btn btn-primary back-btn' }, 'Back to Posts');
}

/** Remove video embeds/links from body when we already render a hero video */
function stripVideoEmbedsFrom(html = '') {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;

  // Remove iframes to youtube/vimeo
  div.querySelectorAll('iframe[src]').forEach((ifr) => {
    const src = (ifr.getAttribute('src') || '').toLowerCase();
    if (src.includes('youtube.com') || src.includes('youtu.be') || src.includes('vimeo.com')) {
      ifr.remove();
    }
  });

  // Remove simple anchors to youtube/vimeo
  div.querySelectorAll('a[href]').forEach((a) => {
    const href = (a.getAttribute('href') || '').toLowerCase();
    if (href.includes('youtube.com') || href.includes('youtu.be') || href.includes('vimeo.com')) {
      a.remove();
    }
  });

  // Tidy up empty paragraphs leftover
  div.querySelectorAll('p').forEach((p) => {
    const text = (p.textContent || '').trim();
    if (!text && p.children.length === 0) p.remove();
  });

  return div.innerHTML;
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

  // Gather media candidates
  const videoSrc = extractMediaFromContent(post.content?.rendered || '');
  const feat     = getFeaturedImage(post);

  // Build hero:
  // - If video + image: show image WITH PLAY OVERLAY; click -> swap to iframe
  // - If video only: show iframe
  // - Else: show image if present
  let hero;
  if (videoSrc && feat) {
    const fig = el('figure', { class: 'hero-image video-hero' },
      el('img', { src: feat, alt: title }),
      el('span', { class: 'play-badge', title: 'Play video' })
    );
    fig.addEventListener('click', () => {
      const wrap = el('div', { class: 'video-wrap' },
        el('iframe', {
          src: videoSrc,
          allowfullscreen: true,
          frameborder: '0',
          loading: 'lazy',
          referrerpolicy: 'no-referrer-when-downgrade'
        })
      );
      fig.replaceWith(wrap);
    });
    hero = el('div', { class: 'hero-media container' }, fig);
  } else if (videoSrc && !feat) {
    hero = el('div', { class: 'hero-media container' },
      el('div', { class: 'video-wrap' },
        el('iframe', {
          src: videoSrc,
          allowfullscreen: true,
          frameborder: '0',
          loading: 'lazy',
          referrerpolicy: 'no-referrer-when-downgrade'
        })
      )
    );
  } else if (feat) {
    hero = el('div', { class: 'hero-media container' },
      el('figure', { class: 'hero-image' },
        el('img', { src: feat, alt: title })
      )
    );
  } else {
    hero = el('div', { class: 'hero-media container' },
      el('div', { class: 'media-fallback' }, '')
    );
  }

  // Title + byline
  const header = el('header', { class: 'post-header container' },
    el('h1', { class: 'post-title' }, title),
    el('div', { class: 'post-byline' }, `${author} • ${date}`),
    el('div', { class: 'byline-divider' })
  );

  // Article body — if we promoted a video to the hero, strip duplicate embeds from body
  const cleanedBody = videoSrc ? stripVideoEmbedsFrom(post.content?.rendered || '') : (post.content?.rendered || '');
  const article = el('article', { class: 'post-body container' });
  article.innerHTML = cleanedBody;

  // Back buttons
  const topBack    = el('div', { class: 'container back-top' }, backButton());
  const bottomBack = el('div', { class: 'container back-bottom' }, backButton());

  // Mount
  mount.innerHTML = '';
  mount.append(hero, topBack, header, article, bottomBack);
}

export default { renderPost };
