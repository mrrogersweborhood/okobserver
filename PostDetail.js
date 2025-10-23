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
    const node = walker.currentNode;
    const tag = node.tagName;

    if (BLOCK_TAGS.has(tag)) {
      toRemove.push(node);
      continue;
    }

    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const val = attr.value || '';
      if (name.startsWith('on')) node.removeAttribute(attr.name);
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(val))
        node.removeAttribute(attr.name);
    }

    if (tag === 'IFRAME') {
      try {
        const src = node.getAttribute('src') || '';
        const u = new URL(src, location.href);
        if (!ALLOW_IFRAME_HOSTS.includes(u.hostname)) {
          toRemove.push(node);
          continue;
        }
        node.setAttribute('width', '100%');
        node.setAttribute('height', '100%');
        node.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
        node.setAttribute('loading', 'lazy');
        node.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
        node.removeAttribute('frameborder');
        node.style.width = '100%';
        node.style.height = '100%';
        node.style.border = '0';
        node.setAttribute('allowfullscreen', '');
      } catch {
        toRemove.push(node);
      }
    }

    if (tag === 'IMG') {
      const src = node.getAttribute('src') || '';
      if (/^\s*javascript:/i.test(src)) {
        toRemove.push(node);
        continue;
      }
      node.style.maxWidth = '100%';
      node.style.height = 'auto';
      node.decoding = 'async';
      node.loading = 'lazy';
    }
  }

  for (const n of toRemove) n.remove();
  return template.innerHTML;
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
      if (isCartoon(post)) {
        wrap.replaceChildren(
          errorView('Not available', 'This article is not available here.'),
          el('a', { href: '#/', className: 'back', 'data-link': true }, 'Back to Posts')
        );
        return;
      }

      const posterUrl = extractMedia(post);
      const poster = wrap.querySelector('#poster');
      poster.classList.remove('skeleton');
      if (posterUrl) {
        const size = imgWH(posterUrl);
        poster.replaceChildren(el('img', { src: posterUrl, alt: '', loading: 'lazy', decoding: 'async', ...size }));
      } else {
        poster.replaceChildren('');
      }

      const btn = el('button', { className: 'play-overlay', ariaLabel: 'Play video' });
      btn.addEventListener('click', () => {
        const mediaUrl = detectProviderUrlFromPost(post);
        let iframeSrc = null;
        if (mediaUrl) {
          const ytWatch = mediaUrl.match(/youtube\\.com\\/watch\\?v=([^&]+)/i);
          const ytShort = mediaUrl.match(/youtu\\.be\\/([^?]+)/i);
          if (ytWatch) iframeSrc = `https://www.youtube.com/embed/${ytWatch[1]}?autoplay=1&rel=0`;
          else if (ytShort) iframeSrc = `https://www.youtube.com/embed/${ytShort[1]}?autoplay=1`;
          const vimeo = mediaUrl.match(/vimeo\\.com\\/(\\d+)/i);
          if (!iframeSrc && vimeo) iframeSrc = `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`;
          if (!iframeSrc && /facebook\\.com/i.test(mediaUrl)) {
            const enc = encodeURIComponent(mediaUrl);
            iframeSrc = `https://www.facebook.com/plugins/video.php?href=${enc}&show_text=false&autoplay=true`;
          }
        }
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

      const title = cleanText(post?.title?.rendered || 'Untitled');
      const authorName = cleanText(post?._embedded?.author?.[0]?.name || 'OkObserver');
      const dateText = fmtDate(post.date);
      wrap.querySelector('.headline').textContent = title;
      wrap.querySelector('.byline').textContent = `By ${authorName} — ${dateText}`;

      // ✅ Full article only
      const contentBox = wrap.querySelector('#post-content');
      const safeContent = sanitizeHTML(post?.content?.rendered || '');
      contentBox.innerHTML = `<div class="article-body">${safeContent}</div>`;

      for (const iframe of contentBox.querySelectorAll('iframe')) {
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = '0';
      }

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
