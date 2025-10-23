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

/** Basic sanitizer: strips risky tags and normalizes media */
function sanitizeHTML(html = '') {
  const template = document.createElement('template');
  template.innerHTML = html;

  const ALLOW_IFRAME_HOSTS = [
    'www.youtube.com','youtube.com','youtu.be',
    'player.vimeo.com','vimeo.com',
    'www.facebook.com','facebook.com'
  ];
  const BLOCK_TAGS = new Set([
    'SCRIPT','STYLE','LINK','OBJECT','EMBED','FORM','INPUT',
    'BUTTON','SELECT','TEXTAREA','NOSCRIPT','META'
  ]);

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const toRemove = [];

  while (walker.nextNode()) {
    const node = /** @type {HTMLElement} */ (walker.currentNode);
    const tag = node.tagName;

    if (BLOCK_TAGS.has(tag)) { toRemove.push(node); continue; }

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
        node.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
        node.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
        node.setAttribute('loading', 'lazy');
        node.setAttribute('allowfullscreen', '');
        node.removeAttribute('frameborder');
        node.removeAttribute('width');
        node.removeAttribute('height');
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

/** Turn common video URLs into embed URLs */
function toEmbedUrl(url) {
  try {
    const u = new URL(url, location.href);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'youtube.com') {
      const v = u.searchParams.get('v');
      if (u.pathname === '/watch' && v) return `https://www.youtube.com/embed/${v}?autoplay=1&rel=0`;
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      const id = parts.find(p => /^\d+$/.test(p));
      if (id) return `https://player.vimeo.com/video/${id}?autoplay=1`;
    }
    if (host === 'facebook.com') {
      const enc = encodeURIComponent(u.href);
      return `https://www.facebook.com/plugins/video.php?href=${enc}&show_text=false&autoplay=true`;
    }
    return null;
  } catch {
    return null;
  }
}

function hasPlayable(post) {
  const url = detectProviderUrlFromPost(post);
  if (url) return true;
  const html = String(post?.content?.rendered || '');
  return /<iframe[^>]+(?:youtube\.com|youtu\.be|vimeo\.com|facebook\.com)/i.test(html);
}

export default function PostDetail({ id }) {
  let aborter = new AbortController();

  const wrap = el('section', { className: 'detail' },
    el('div', { className: 'poster skeleton', id: 'poster' }),
    el('a', { href: '#/', className: 'back', 'data-link': true }, 'Back to Posts'),
    el('h1', { className: 'headline' }, '…'),
    el('div', { className: 'byline' }, '…'),
    el('div', { className: 'content', id: 'post-content' })
  );

  async function load() {
    try {
      const { data: post } = await getPost(id, { signal: aborter.signal, timeout: 10000, retries: 1 });

      // Block cartoon-category posts
      if (isCartoon(post)) {
        wrap.replaceChildren(
          errorView('Not available', 'This article is not available here.'),
          el('a', { href: '#/', className: 'back', 'data-link': true }, 'Back to Posts')
        );
        return;
      }

      const poster = wrap.querySelector('#poster');
      poster.classList.remove('skeleton');

      // --- IMPORTANT: avoid flashing a black box while loading ---
      // Hide poster until we know whether it's an image or playable video.
      poster.style.display = 'none';

      const posterUrl = extractMedia(post);
      const playable = hasPlayable(post);

      if (posterUrl) {
        // IMAGE MODE: show image with no cropping
        poster.style.display = '';
        poster.classList.add('has-image');
        poster.replaceChildren(el('img', {
          src: posterUrl,
          alt: '',
          loading: 'lazy',
          decoding: 'async',
          ...imgWH(posterUrl)
        }));
      } else if (playable) {
        // VIDEO MODE (lazy play until user clicks)
        poster.style.display = '';
        poster.classList.remove('has-image');

        const btn = el('button', { className: 'play-overlay', ariaLabel: 'Play video' });
        btn.addEventListener('click', () => {
          const mediaUrl = detectProviderUrlFromPost(post);
          const iframeSrc = mediaUrl ? toEmbedUrl(mediaUrl) : null;

          const iframe = el('iframe', {
            allow: 'autoplay; fullscreen; picture-in-picture',
            loading: 'lazy',
            referrerPolicy: 'no-referrer-when-downgrade',
            src: iframeSrc || 'about:blank'
          });

          const wrapper = el('div', { className: 'embed-16x9' }, iframe);
          poster.classList.remove('has-image'); // ensure video style
          poster.replaceChildren(wrapper);
        });
        poster.append(btn);
      } else {
        // No media; remove placeholder entirely
        poster.remove();
      }

      // Headline & byline
      wrap.querySelector('.headline').textContent = cleanText(post?.title?.rendered || 'Untitled');
      const authorName = cleanText(post?._embedded?.author?.[0]?.name || 'OkObserver');
      const dateText = fmtDate(post.date);
      wrap.querySelector('.byline').textContent = `By ${authorName} — ${dateText}`;

      // Full article (sanitized)
      const contentBox = wrap.querySelector('#post-content');
      const safeContent = sanitizeHTML(post?.content?.rendered || '');
      contentBox.innerHTML = `<div class="article-body">${safeContent}</div>`;

      // Normalize inline media inside article
      for (const img of contentBox.querySelectorAll('img')) {
        img.removeAttribute('width');
        img.removeAttribute('height');
        Object.assign(img.style, { width: '100%', maxWidth: '100%', height: 'auto' });
      }

      // Make embedded iframes responsive inside article
      for (const iframe of [...contentBox.querySelectorAll('iframe')]) {
        if (!iframe.closest('.embed-16x9')) {
          const wrap16 = document.createElement('div');
          wrap16.className = 'embed-16x9';
          iframe.parentNode.insertBefore(wrap16, iframe);
          wrap16.appendChild(iframe);
        }
      }

      // Bottom Back button
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
