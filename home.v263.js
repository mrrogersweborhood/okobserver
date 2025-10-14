// home.v263.js
// OkObserver Home page (self-contained; no utils imports)
// v2.6.x-home-safe-links-noutils

const PAGE_SIZE = 18;
let paging = { page: 1, loading: false, done: false };
let io = null;

// -------- helpers (local, no external imports) --------
function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch {
    return iso || '';
  }
}
function stripTags(html) {
  return (html || '').replace(/<\/?[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
async function fetchJson(url, { retries = 1 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { credentials: 'omit', mode: 'cors' });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(res => setTimeout(res, 400 * (i + 1)));
    }
  }
  throw lastErr;
}
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

// -------- data helpers --------
function pickImage(post) {
  const emb = post._embedded?.['wp:featuredmedia']?.[0];
  if (emb?.source_url) return emb.source_url;
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(post.content?.rendered || '');
  return m ? m[1] : '';
}
function authorName(post) {
  const a = post._embedded?.author?.[0];
  return a?.name || 'Oklahoma Observer';
}
function makeExcerpt(post) {
  const rx = post.excerpt?.rendered || post.content?.rendered || '';
  const text = stripTags(rx);
  return text.length > 240 ? text.slice(0, 240) + '…' : text;
}

// -------- templates --------
function card(post) {
  const img = pickImage(post);
  const href = `#/post/${post.id}`;
  return `
    <article class="post-card">
      <div class="post-card__thumb">
        ${img ? `<a href="${href}" class="post-link" aria-label="${stripTags(post.title?.rendered)}">
          <img src="${img}" alt="${stripTags(post.title?.rendered)}" loading="lazy">
        </a>` : ''}
      </div>
      <h3 class="post-card__title">
        <a href="${href}" class="post-link">${post.title?.rendered || ''}</a>
      </h3>
      <div class="post-card__meta">
        <span class="post-card__by">By ${authorName(post)}</span>
        <span class="post-card__dot"> • </span>
        <span class="post-card__date">${fmtDate(post.date)}</span>
      </div>
      <p class="post-card__excerpt">${makeExcerpt(post)}</p>
    </article>
  `;
}
function cards(posts) { return posts.map(card).join(''); }

// -------- API --------
async function fetchPosts(page = 1) {
  const base = window.OKO_API_BASE; // must be set by main.js as you had before
  if (!base) throw new Error('[Home] API base missing.');
  const url = `${base}/wp-json/wp/v2/posts?status=publish&_embed=1&per_page=${PAGE_SIZE}&page=${page}`;
  return await fetchJson(url, { retries: 1 });
}

// -------- link wiring (hash SPA) --------
function wireLinks(scope = document) {
  $all('.post-link', scope).forEach(a => {
    if (a.dataset.wired === '1') return;
    a.dataset.wired = '1';
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#/')) {
        e.preventDefault();
        if (location.hash === href) {
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } else {
          location.hash = href;
        }
      }
    }, { passive: false });
  });
}

// -------- infinite scroll --------
function attachInfinite(root, grid) {
  if (io) io.disconnect();
  const s = document.createElement('div');
  s.className = 'io-sentinel';
  grid.appendChild(s);

  io = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting) return;
    if (paging.loading || paging.done) return;

    paging.loading = true;
    try {
      paging.page += 1;
      const more = await fetchPosts(paging.page);
      if (!Array.isArray(more) || more.length === 0) {
        paging.done = true;
        io.disconnect();
        s.remove();
        return;
      }
      grid.insertAdjacentHTML('beforeend', cards(more));
      wireLinks(grid);
    } catch (e) {
      console.error('[Home] infinite error', e);
      paging.done = true;
      io.disconnect();
      s.remove();
    } finally {
      paging.loading = false;
    }
  }, { rootMargin: '1200px 0px 1200px 0px', threshold: 0 });

  io.observe(s);
}

// -------- entry --------
export default async function renderHome(app) {
  // do NOT touch your header/motto; only replace app contents
  paging = { page: 1, loading: false, done: false };

  app.innerHTML = `
    <section class="home">
      <h2 class="section-title">Latest Posts</h2>
      <div id="post-grid" class="post-grid"></div>
    </section>
  `;

  const grid = $('#post-grid', app);
  try {
    const posts = await fetchPosts(1);
    grid.innerHTML = cards(posts || []);
    wireLinks(grid);
    attachInfinite(app, grid);
  } catch (e) {
    console.error('[Home] load failed:', e);
    grid.innerHTML = `<p class="error">Failed to fetch posts.</p>`;
  }
}
