// /PostDetail.js
import { el, fmtDate, errorView, imgWH, decodeHTML } from './util.js';
import { getPost, extractMedia, detectProviderUrlFromPost } from './api.js';

function cleanText(html = '') {
  const stripped = html.replace(/<[^>]+>/g, '');
  return decodeHTML(stripped).trim();
}

function isCartoon(post) {
  const cats = post?._embedded?.['wp:term']?.[0] || [];
  return cats.some(c => String(c?.slug || '').toLowerCase() === 'cartoon');
}

/**
 * Minimal HTML sanitizer for WordPress-rendered content.
 * - Removes risky elements and event handlers.
 * - Allows <iframe> only for known hosts (YouTube, Vimeo, Facebook) and forces safe attrs.
 */
function sanitizeHTML(html = '') {
  const template = document.createElement('template');
  template.innerHTML = html;

  const ALLOW_IFRAME_HOSTS = [
    'www.youtube.com', 'youtube.com', 'youtu.be',
    'player.vimeo.com', 'vimeo.com',
    'www.facebook.com', 'facebook.com'
  ];
  const BLOCK_TAGS = new Set([
    'SCRIPT', 'STYLE', 'LINK', 'OBJECT', 'EMBED', 'FORM', 'INPUT',
    'BUTTON', 'SELECT', 'TEXTAREA', 'NOSCRIPT', 'META'
  ]);

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const toRemove = [];

  while (walker.nextNode()) {
    const node = /** @type {HTMLElement} */ (walker.currentNode);
    const tag = node.tagName;

    if (BLOCK_TAGS.has(tag)) { toRemove.push(node); continue; }

    // Strip event handlers & javascript: URLs
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const val = attr.value || '';
      if (name.startsWith('on')) node.removeAttribute(attr.name);
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(val)) node.removeAttribute(attr.name);
    }

    if (tag === 'IFRAME') {
      try {
        const src = node.getAttribute('src') || '';
        const u = new URL(src, location.href);
        if (!ALLOW_IFRAME_HOSTS.includes(u.hostname)) { toRemove.push(node); continue; }
        node.setAttribute('width', '100%');
        node.setAttribute('height', '100%');
        node.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
        node.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
        node.setAttribute('loading', 'lazy');
        node.setAttribute('allowfullscreen', '');
        node.removeAttribute('frameborder');
        Object.assign(node.style, { width: '100%', height: '100%', border: '0' });
      } catch { toRemove.push(node); }
    }

    if (tag === 'IMG') {
      const src = node.getAttribute('src') || '';
      if (/^\s*javascript:/i.test(src)) { toRemove.push(node); continue; }
      Object.assign(node, { decoding: 'async', loading: 'lazy' });
      Object.assign(node.style, { maxWidth: '100%', height: 'auto' });
    }
  }

  for (const n of toRemove) n.remove();
  return template.innerHTML;
}

/** Regex-free conversion of provider URLs to embeddable iframe URLs */
function toEmbedUrl(url) {
  try {
    const u = new URL(url, location.href);
    const host = u.hostname.replace(/^www\./, '');

    // YouTube
    if (host === 'youtube.com') {
      const v = u.searchParams.get('v');
      if (u.pathname === '/watch' && v) {
        return `https://www.youtube.com/embed/${v}?autoplay=1&rel=0`;
      }
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
    }

    // Vimeo
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      const id = parts.find(p => /^\d+$/.test(p));
      if (id) return `https://player.vimeo.com/video/${id}?autoplay=1`;
    }

    // Facebook video
    if (host === 'facebook.com') {
      const enc = encodeURIComponent(u.href);
      return `https://www.facebook.com/plugins/video.php?href=${enc}&show_text=false&autoplay=true`;
    }

    return null;
  } catch {
    return null;
  }
}

export default function PostDetail({ id }) {
  let aborter = new AbortController();

  const wrap = el('section', { className: 'detail' },
    el('div', { className: 'poster skeleton', id: 'poster' }),
    el('h1', { className: 'headline' }, '…'),
    el('div', { className: 'byline' }, '…'),
    el('div', { className: 'content', id: 'post-content' })
  );

  async function load() {
    try {
      const { data: post } = await getPost(id, { signal: aborter.signal, timeout: 10000, retries: 1 });

      // Defense-in-depth: block cartoon-category posts
      if (isCartoon(post)) {
        wrap.replaceChildren(
          errorView('Not available', 'This article is not available here.'),
          el('a', { href: '#/', className: 'back', 'data-link': true }, 'Back to Posts')
        );
        return;
      }

      // Poster (featured image)
      const posterUrl = extractMedia(post);
      const poster = wrap.querySelector('#poster');
      poster.classList.remove('skeleton');
      if (posterUrl) {
        const size = imgWH(posterUrl);
        poster.replaceChildren(el('img', { src: posterUrl, alt: '', loading: 'lazy', decoding: 'async', ...size }));
      } else {
        poster.replaceChildren('');
      }

      // Optional play overlay (launches provider iframe over poster)
      const btn = el('button', { className: 'play-overlay', ariaLabel: 'Play video' });
      btn.addEventListener('click', () => {
        const mediaUrl = detectProviderUrlFromPost(post);
        const iframeSrc = mediaUrl ? toEmbedUrl(mediaUrl) : null;
        const iframe = el('iframe', {
          width: '100%',
          height: '100%',
          allow: 'autoplay; fullscreen; picture-in-picture',
          loading: 'lazy',
          referrerPolicy: 'no-referrer-when-downgrade',
          src: iframeSrc || 'about:blank'
        });
        poster.replaceChildren(iframe);
      });
      poster.append(btn);

      // Headline & byline
      wrap.querySelector('.headline').textContent = cleanText(post?.title?.rendered || 'Untitled');
      const authorName = cleanText(post?._embedded?.author?.[0]?.name || 'OkObserver');
      const dateText = fmtDate(post.date);
      wrap.querySelector('.byline').textContent = `By ${authorName} — ${dateText}`;

      // Full article (sanitized)
      const contentBox = wrap.querySelector('#post-content');
      const safeContent = sanitizeHTML(post?.content?.rendered || '');
      contentBox.innerHTML = `<div class="article-body">${safeContent}</div>`;

      // Ensure any iframes in content are responsive
      for (const iframe of contentBox.querySelectorAll('iframe')) {
        Object.assign(iframe.style, { width: '100%', height: '100%', border: '0' });
      }

      // Back link
      wrap.append(el('a', { href: '#/', className: 'back', 'data-link': true }, 'Back to Posts'));
    } catch (err) {
      console.error('[OkObserver] detail error', err);
      wrap.replaceChildren(errorView('Unable to load this article', err?.message || err));
    }
  }

  load();

  return {
    mount(el) { el.replaceChildren(wrap); },
    unmount() { aborter.abort(); }
  };
}
