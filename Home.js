// /Home.js
import {
  el, fmtDate, gridEnforcer, mem,
  restoreScroll, persistMemToSession, restoreMemFromSession,
  errorView, imgWH, decodeHTML
} from './util.js';
import { getPosts, extractMedia } from './api.js';

// WordPress categories and content filters
// Filter out anything from the "cartoon" category or containing keywords
const EXCLUDE_KEYWORDS = ['cartoon', 'comic', 'toon'];
const EXCLUDE_CATEGORY_SLUGS = ['cartoon'];

function shouldExclude(post) {
  const title = (post?.title?.rendered || '').toLowerCase();
  const content = (post?.excerpt?.rendered || post?.content?.rendered || '').toLowerCase();

  // Exclude by title/content keyword
  if (EXCLUDE_KEYWORDS.some(k => title.includes(k) || content.includes(k))) return true;

  // Exclude by category slug (requires embedded category info)
  const cats = post?._embedded?.['wp:term']?.[0] || [];
  if (cats.some(c => EXCLUDE_CATEGORY_SLUGS.includes(c.slug?.toLowerCase()))) return true;

  return false;
}

function cleanText(html = '') {
  const stripped = html.replace(/<[^>]+>/g, '');
  return decodeHTML(stripped).trim();
}

function short(text = '', max = 140) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('—'));
  return (last > 60 ? cut.slice(0, last) : cut) + '…';
}

export default function Home() {
  let page = 1, loading = false, done = false, aborter = null, detachEnforcer = null;

  const grid = el('section', { className: 'grid', id: 'post-grid' });
  const sentinel = el('div', { id: 'sentinel', style: 'height:1px' });
  const root = el('div', {}, grid, sentinel);

  function renderCard(post) {
    const poster = extractMedia(post);
    const size = poster ? imgWH(poster) : null;
    const title = cleanText(post?.title?.rendered || 'Untitled');

    const excerptHtml = post?.excerpt?.rendered || post?.content?.rendered || '';
    const excerpt = short(cleanText(excerptHtml), 160);

    return el('article', { className: 'card' },
      el('a', { href: `#/post/${post.id}`, 'data-link': true },
        el('div', { className: 'media' },
          poster
            ? el('img', {
                src: poster,
                alt: '',
                loading: 'lazy',
                decoding: 'async',
                ...(size || {})
              })
            : ''
        )
      ),
      el('div', { className: 'body' },
        el('h2', { className: 'title' }, title),
        excerpt ? el('p', { className: 'excerpt' }, excerpt) : null,
        el('div', { className: 'meta' }, fmtDate(post.date))
      )
    );
  }

  async function load() {
    if (loading || done) return;
    loading = true;
    aborter?.abort();
    aborter = new AbortController();

    if (page === 1) {
      const hadSession = restoreMemFromSession();
      if (hadSession || mem.posts.length) {
        const frag = document.createDocumentFragment();
        mem.posts.forEach(p => frag.append(renderCard(p)));
        grid.append(frag);
        page = mem.postsPage + 1;
        loading = false;
        requestAnimationFrame(restoreScroll);
        return;
      }
    }

    grid.append(el('div', { className: 'card skeleton', style: 'height:200px' }));
    try {
      const { data } = await getPosts(
        {
          page,
          per_page: 12,
          _embed: true
        },
        { signal: aborter.signal, timeout: 10000, retries: 1 }
      );

      // ✅ filter out excluded posts by keyword and category
      const allowed = data.filter(p => !shouldExclude(p));

      const frag = document.createDocumentFragment();
      allowed.forEach(p => {
        mem.posts.push(p);
        frag.append(renderCard(p));
      });

      [...grid.querySelectorAll('.skeleton')].forEach(n => n.remove());
      grid.append(frag);

      mem.postsPage = page;
      persistMemToSession();

      page++;
      if (!data.length) done = true;
    } catch (err) {
      console.error('[OkObserver] load error', err);
      [...grid.querySelectorAll('.skeleton')].forEach(n => n.remove());
      grid.append(errorView('Unable to load posts', err?.message || err));
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
    mount(el) { el.replaceChildren(root); },
    unmount() {
      io.disconnect();
      detachEnforcer && detachEnforcer();
      aborter?.abort();
    }
  };
}
