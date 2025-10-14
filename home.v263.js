// home.v263.js
// OkObserver Home page (safe revision): only make image/title clickable without touching layout/header
// v2.6.x-home-safe-links

import { apiFetchJson, fmtDate, html, qs, qsa } from './utils.js';

const PAGE_SIZE = 18; // keep your existing page size
let paging = {
  page: 1,
  loading: false,
  done: false,
};

function postImage(post) {
  // prefer WP featured media from _embedded if present; fall back to first image in content
  const emb = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
  if (emb && emb.source_url) return emb.source_url;

  // fallback: crude parse first <img ... src="...">
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(post.content?.rendered || '');
  return m ? m[1] : '';
}

function postExcerpt(post) {
  // use rendered excerpt if present; otherwise trim content
  const rx = (post.excerpt && post.excerpt.rendered) ? post.excerpt.rendered : (post.content?.rendered || '');
  // strip tags
  const text = rx.replace(/<\/?[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return text.length > 240 ? text.slice(0, 240) + '…' : text;
}

function authorName(post) {
  const emb = post._embedded && post._embedded.author && post._embedded.author[0];
  return emb?.name || 'Oklahoma Observer';
}

// ---------- rendering ----------

function postCard(post) {
  const img = postImage(post);
  const date = fmtDate(post.date);
  const author = authorName(post);
  const href = `#/post/${post.id}`;

  // IMPORTANT: we wrap only the image and the title with <a href="#/post/{id}">
  // All other markup remains exactly as before so layout, spacing, and CSS stay intact.
  return html/*html*/`
    <article class="post-card">
      <div class="post-card__thumb">
        ${img ? `<a href="${href}" class="post-link" aria-label="${post.title.rendered}">
          <img src="${img}" alt="${post.title.rendered}" loading="lazy" />
        </a>` : ''}
      </div>

      <h3 class="post-card__title">
        <a href="${href}" class="post-link">${post.title.rendered}</a>
      </h3>

      <div class="post-card__meta">
        <span class="post-card__by">By ${author}</span>
        <span class="post-card__dot"> • </span>
        <span class="post-card__date">${date}</span>
      </div>

      <p class="post-card__excerpt">${postExcerpt(post)}</p>
    </article>
  `;
}

function gridTemplate(posts) {
  return posts.map(postCard).join('');
}

// ---------- data ----------

async function fetchPosts(page = 1) {
  // keep your Cloudflare proxy + embed so we have author & media
  const url = `${window.OKO_API_BASE}/wp-json/wp/v2/posts?status=publish&_embed=1&per_page=${PAGE_SIZE}&page=${page}`;
  const data = await apiFetchJson(url);

  // If you exclude “cartoon” elsewhere, keep it. Otherwise, leave untouched.
  // (No additional filtering here to avoid changing your content rules.)
  return Array.isArray(data) ? data : [];
}

// ---------- infinite scroll ----------

let observer;

function attachInfiniteScroll(container, list) {
  if (observer) observer.disconnect();

  const sentinel = document.createElement('div');
  sentinel.className = 'io-sentinel';
  list.appendChild(sentinel);

  observer = new IntersectionObserver(async (entries) => {
    const entry = entries[0];
    if (!entry.isIntersecting) return;
    if (paging.loading || paging.done) return;

    paging.loading = true;
    try {
      paging.page += 1;
      const more = await fetchPosts(paging.page);
      if (!more.length) {
        paging.done = true;
        observer.disconnect();
        sentinel.remove();
        return;
      }
      list.insertAdjacentHTML('beforeend', gridTemplate(more));
      // safety: ensure router catches clicks even if CSS overlays exist
      wireLinks(list);
    } catch (e) {
      // quietly stop on error to avoid breaking layout
      paging.done = true;
      observer.disconnect();
      sentinel.remove();
      console.error('[Home] infinite-scroll error', e);
    } finally {
      paging.loading = false;
    }
  }, { rootMargin: '1200px 0px 1200px 0px', threshold: 0 });

  observer.observe(sentinel);
}

// ---------- click wiring (safe) ----------

function wireLinks(scope = document) {
  qsa('.post-link', scope).forEach((a) => {
    // Avoid double-binding
    if (a.dataset.wired === '1') return;
    a.dataset.wired = '1';
    a.addEventListener('click', (e) => {
      // ensure SPA navigation
      const href = a.getAttribute('href');
      if (href && href.startsWith('#/')) {
        e.preventDefault();
        if (location.hash === href) {
          // re-trigger route if already on same hash
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } else {
          location.hash = href;
        }
      }
    }, { passive: false });
  });
}

// ---------- main render ----------

export default async function renderHome(app) {
  // Reset paging for a fresh visit, but don’t touch header, motto, or global layout
  paging = { page: 1, loading: false, done: false };

  app.innerHTML = html/*html*/`
    <section class="home">
      <h2 class="section-title">Latest Posts</h2>
      <div id="post-grid" class="post-grid"></div>
    </section>
  `;

  const grid = qs('#post-grid', app);

  try {
    const posts = await fetchPosts(1);
    grid.innerHTML = gridTemplate(posts);
    wireLinks(grid);
    attachInfiniteScroll(app, grid);
  } catch (err) {
    console.error('[Home] load failed:', err);
    grid.innerHTML = `<p class="error">Failed to fetch posts.</p>`;
  }
}
