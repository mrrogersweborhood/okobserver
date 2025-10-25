// PostDetail.js — v2025-10-24g
import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPost } from './api.js?v=2025-10-24e';

/* -------------------------------
   Helpers: normalize + detect embeds
----------------------------------*/
function normalizeVideoSrc(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    // YouTube
    if (host.includes('youtu.be')) {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      const m = u.pathname.match(/\/embed\/([^/?#]+)/);
      if (m) return `https://www.youtube.com/embed/${m[1]}`;
    }

    // Vimeo
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) return `https://player.vimeo.com/video/${last}`;
    }
    if (host === 'player.vimeo.com') return url;

  } catch {}
  return null;
}

function findVideoSrcInHTML(html = '') {
  const div = document.createElement('div');
  div.innerHTML = html;

  // iframe first
  const ifr = div.querySelector('iframe[src]');
  if (ifr) {
    const n = normalizeVideoSrc(ifr.getAttribute('src') || '');
    if (n) return n;
  }
  // anchors next
  const a = Array.from(div.querySelectorAll('a[href]')).find(a => {
    const h = (a.getAttribute('href') || '').toLowerCase();
    return h.includes('youtube.com') || h.includes('youtu.be') || h.includes('vimeo.com');
  });
  if (a) {
    const n = normalizeVideoSrc(a.getAttribute('href') || '');
    if (n) return n;
  }
  return null;
}

/** Remove video embeds/links + ALL common WP/Jetpack wrappers that leave blank space */
function stripVideoEmbedsFrom(html = '') {
  const div = document.createElement('div');
  div.innerHTML = html;

  // 1) remove iframes to youtube/vimeo
  div.querySelectorAll('iframe[src]').forEach((ifr) => {
    const src = (ifr.getAttribute('src') || '').toLowerCase();
    if (src.includes('youtube.com') || src.includes('youtu.be') || src.includes('vimeo.com')) {
      ifr.remove();
    }
  });

  // 2) remove link-only embeds
  div.querySelectorAll('a[href]').forEach((a) => {
    const href = (a.getAttribute('href') || '').toLowerCase();
    if (href.includes('youtube.com') || href.includes('youtu.be') || href.includes('vimeo.com')) a.remove();
  });

  // 3) nuke common wrapper classes (these often reserve aspect-ratio space)
  const WRAPPER_CLS = [
    'wp-block-embed',
    'wp-block-embed__wrapper',
    'wp-embed-aspect-16-9',
    'wp-embed-aspect-4-3',
    'jetpack-video-wrapper',
    'wp-block-video',
    'wp-block-embed-youtube',
    'wp-block-embed-vimeo'
  ];
  div.querySelectorAll('*').forEach((node) => {
    const cls = (node.className || '').toString();
    if (WRAPPER_CLS.some(c => cls.includes(c))) {
      node.remove();
    }
  });

  // 4) collapse empty paragraphs/figures/divs left behind
  div.querySelectorAll('p, figure, div').forEach((n) => {
    const text = (n.textContent || '').trim();
    if (!text && n.children.length === 0) n.remove();
  });

  return div.innerHTML;
}

/* -------------------------------
   Render
----------------------------------*/
function backButton() {
  return el('a', { href: '#/', class: 'btn btn-primary back-btn' }, 'Back to Posts');
}

export async function renderPost(mount, id) {
  if (mount) mount.innerHTML = '<div class="loading">Loading…</div>';
  const post = await getPost(id);

  const title  = decodeHTML(post.title?.rendered || 'Untitled');
  const date   = formatDate(post.date);
  const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';

  const bodyHTML = post.content?.rendered || '';
  const videoSrc = findVideoSrcInHTML(bodyHTML);
  const featured = (() => {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    const sizes = media?.media_details?.sizes;
    return (
      sizes?.large?.source_url ||
      sizes?.medium_large?.source_url ||
      media?.source_url || ''
    );
  })();

  // Build hero
  let hero;
  if (videoSrc && featured) {
    // Featured image with play overlay; click -> swap to iframe
    const fig = el('figure', { class: 'hero-image video-hero' },
      el('img', { src: featured, alt: title }),
      el('span', { class: 'play-badge', title: 'Play video' })
    );
    fig.addEventListener('click', () => {
      fig.replaceWith(
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
    });
    hero = el('div', { class: 'hero-media container' }, fig);
  } else if (videoSrc) {
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
  } else if (featured) {
    hero = el('div', { class: 'hero-media container' },
      el('figure', { class: 'hero-image' }, el('img', { src: featured, alt: title }))
    );
  } else {
    hero = el('div', { class: 'hero-media container' }, el('div', { class: 'media-fallback' }, ''));
  }

  const header = el('header', { class: 'post-header container' },
    el('h1', { class: 'post-title' }, title),
    el('div', { class: 'post-byline' }, `${author} • ${date}`),
    el('div', { class: 'byline-divider' })
  );

  // Clean the article body of any video wrappers to eliminate the gap
  const cleanedBody = videoSrc ? stripVideoEmbedsFrom(bodyHTML) : bodyHTML;
  const article = el('article', { class: 'post-body container' });
  article.innerHTML = cleanedBody;

  const topBack    = el('div', { class: 'container back-top' }, backButton());
  const bottomBack = el('div', { class: 'container back-bottom' }, backButton());

  mount.innerHTML = '';
  mount.append(hero, topBack, header, article, bottomBack);

  console.info('[OkObserver] PostDetail v2025-10-24g', { id, videoSrc, featuredLoaded: !!featured });
}
