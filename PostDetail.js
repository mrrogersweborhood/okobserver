// /src/views/PostDetail.js
import { el, fmtDate, errorView, imgWH } from '../lib/util.js';
import { getPost, extractMedia, detectProviderUrlFromPost } from '../lib/api.js';

export default function PostDetail({ id }) {
  let aborter = new AbortController();
  const wrap = el('section', { className: 'detail' },
    el('div', { className: 'poster skeleton', id: 'poster' }),
    el('h1', { className: 'headline' }, '…'),
    el('div', { className: 'byline' }, '…'),
  );

  async function load() {
    try {
      const { data: post } = await getPost(id, { signal: aborter.signal, timeout: 10000, retries: 1 });
      const posterUrl = extractMedia(post);

      const poster = wrap.querySelector('#poster');
      poster.classList.remove('skeleton');
      if (posterUrl) {
        const size = imgWH(posterUrl);
        poster.replaceChildren(
          el('img', { src: posterUrl, alt: '', loading: 'lazy', decoding: 'async', ...size })
        );
      } else {
        poster.replaceChildren('');
      }

      // Play button overlay for embedded video content
      const btn = el('button', { className: 'play-overlay', ariaLabel: 'Play video' });
      btn.addEventListener('click', () => {
        const mediaUrl = detectProviderUrlFromPost(post);
        let iframeSrc = null;

        if (mediaUrl) {
          const ytWatch = mediaUrl.match(/youtube\.com\/watch\?v=([^&]+)/i);
          const ytShort = mediaUrl.match(/youtu\.be\/([^?]+)/i);
          if (ytWatch) iframeSrc = `https://www.youtube.com/embed/${ytWatch[1]}?autoplay=1&rel=0`;
          else if (ytShort) iframeSrc = `https://www.youtube.com/embed/${ytShort[1]}?autoplay=1&rel=0`;

          const vimeo = mediaUrl.match(/vimeo\.com\/(\d+)/i);
          if (!iframeSrc && vimeo) iframeSrc = `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`;

          if (!iframeSrc && /facebook\.com/i.test(mediaUrl)) {
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

      wrap.querySelector('.headline').textContent =
        post.title?.rendered?.replace(/<[^>]+>/g, '') || 'Untitled';

      wrap.querySelector('.byline').textContent =
        `By ${post._embedded?.author?.[0]?.name || 'OkObserver'} — ${fmtDate(post.date)}`;

      wrap.append(
        el('a', { href: '#/', className: 'back', 'data-link': true }, 'Back to Posts')
      );
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
