import { el, fmtDate } from '../lib/util.js';
import { getPost, extractMedia } from '../lib/api.js';

export default function PostDetail({ id }){
  let aborter = new AbortController();
  const wrap = el('section', { className: 'detail' },
    el('div', { className: 'poster skeleton', id: 'poster' }),
    el('h1', { className: 'headline' }, '…'),
    el('div', { className: 'byline' }, '…'),
  );

  async function load(){
    try{
      const { data: post } = await getPost(id, { signal: aborter.signal });
      const posterUrl = extractMedia(post);

      const poster = wrap.querySelector('#poster');
      poster.classList.remove('skeleton');
      poster.replaceChildren(posterUrl ? el('img', { src: posterUrl, alt: '', loading: 'lazy', decoding: 'async' }) : '');

      const btn = el('button', { className: 'play-overlay', ariaLabel: 'Play video' });
      btn.addEventListener('click', () => {
        const iframe = el('iframe', { width: '100%', height: '100%', allow: 'autoplay; fullscreen', loading: 'lazy' });
        poster.replaceChildren(iframe);
      });
      poster.append(btn);

      wrap.querySelector('.headline').textContent = post.title?.rendered?.replace(/<[^>]+>/g,'') || 'Untitled';
      wrap.querySelector('.byline').textContent = `By ${post._embedded?.author?.[0]?.name || 'OkObserver'} — ${fmtDate(post.date)}`;

      wrap.append(el('a', { href: '#/', className: 'back', 'data-link': true }, 'Back to Posts'));
    } catch(err){ console.error('[OkObserver] detail error', err); }
  }

  load();

  return {
    mount(el){ el.replaceChildren(wrap); },
    unmount(){ aborter.abort(); }
  };
}
