import { el, fmtDate, gridEnforcer } from '../lib/util.js';
import { getPosts, extractMedia } from '../lib/api.js';

export default function Home(){
  let page = 1, loading = false, done = false, aborter = null, detachEnforcer = null;

  const grid = el('section', { className: 'grid', id: 'post-grid' });
  const sentinel = el('div', { id: 'sentinel', style: 'height:1px' });
  const root = el('div', {}, grid, sentinel);

  function renderCard(post){
    const poster = extractMedia(post);
    const card = el('article', { className: 'card' },
      el('a', { href: `#/post/${post.id}`, 'data-link': true },
        el('div', { className: 'media' }, poster ? el('img', { src: poster, alt: '', loading: 'lazy', decoding: 'async' }) : '')),
      el('div', { className: 'body' },
        el('h2', { className: 'title' }, post.title?.rendered?.replace(/<[^>]+>/g,'') || 'Untitled'),
        el('div', { className: 'meta' }, fmtDate(post.date)))
    );
    return card;
  }

  async function load(){
    if (loading || done) return; loading = true;
    aborter?.abort(); aborter = new AbortController();
    grid.append(el('div', { className: 'card skeleton', style: 'height:200px' }));
    try{
      const { data } = await getPosts({ page, per_page: 12 }, { signal: aborter.signal });
      const frag = document.createDocumentFragment();
      data.forEach(p => frag.append(renderCard(p)));
      [...grid.querySelectorAll('.skeleton')].forEach(n => n.remove());
      grid.append(frag);
      page++; if (!data.length) done = true;
    } catch(err){
      console.error('[OkObserver] load error', err);
    } finally {
      loading = false;
    }
  }

  const io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) load();
  }, { rootMargin: '800px 0px' });
  io.observe(sentinel);

  detachEnforcer = gridEnforcer(grid);

  load();

  return {
    mount(el){ el.replaceChildren(root); },
    unmount(){ io.disconnect(); detachEnforcer && detachEnforcer(); aborter?.abort(); }
  };
}
