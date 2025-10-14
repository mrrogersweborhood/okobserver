// home.v263.js  —  OkObserver Home (v2.6.x compatible)
//
// Exports both named `home` and default for loader compatibility.
// No external utils import—self-contained (apiFetch, prettyDate, etc).

/* -------------------------------- Utilities ------------------------------- */

const API_BASE = (() => {
  if (typeof window !== "undefined" && window.OKO_API_BASE && window.OKO_API_BASE.trim()) {
    return window.OKO_API_BASE.trim().replace(/\/+$/,'');
  }
  // Also allow meta fallback if someone loaded this file standalone
  const meta = typeof document !== "undefined" && document.querySelector('meta[name="oko-api-base"]');
  const fromMeta = meta ? (meta.getAttribute('content') || '').trim() : '';
  return (fromMeta || 'https://okobserver-proxy.bob-b5c.workers.dev').replace(/\/+$/,'');
})();

/** Small fetch with retry (JSON only) */
async function apiFetchJson(url, { tries = 2, signal } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal, headers: { 'Accept': 'application/json' } });
      if (!r.ok) throw new Error(`API ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      await new Promise(res => setTimeout(res, 250 * (i + 1)));
    }
  }
  throw lastErr || new Error('API error');
}

const prettyDate = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return iso; }
};

const stripHtml = (html) => {
  const t = document.createElement('div');
  t.innerHTML = html || '';
  return t.textContent || t.innerText || '';
};

const getFeaturedSrc = (post) => {
  // With _embed, image url lives at: _embedded['wp:featuredmedia'][0].source_url
  const em = post && post._embedded && post._embedded['wp:featuredmedia'];
  return (em && em[0] && em[0].source_url) || '';
};

const isCartoonish = (post) => {
  // Filter out “cartoon(s)” in categories or tags (slug or name)
  const terms = [];
  const embed = post && post._embedded || {};
  (embed['wp:term'] || []).forEach(arr => arr.forEach(t => terms.push(t)));
  const hay = terms
    .map(t => (t?.slug || t?.name || '').toLowerCase())
    .join(' ');
  return /\bcartoon(s)?\b/.test(hay);
};

/* ------------------------------- Rendering -------------------------------- */

function homeGridStylesOnce() {
  // Add minimal grid CSS only once (keeps your styles.css as source of truth;
  // this guarantees 4-col on wide even if CSS cache lags).
  if (document.getElementById('oko-home-inline-grid')) return;
  const css = `
  .oko-home-grid {
    display:grid; gap:16px; grid-template-columns:repeat(1,minmax(0,1fr));
  }
  @media (min-width: 680px){ .oko-home-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
  @media (min-width: 980px){ .oko-home-grid { grid-template-columns: repeat(3,minmax(0,1fr)); } }
  @media (min-width: 1260px){ .oko-home-grid { grid-template-columns: repeat(4,minmax(0,1fr)); } }
  .oko-card { background:#fff; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.08); overflow:hidden; border:1px solid rgba(0,0,0,.06); }
  .oko-card a { text-decoration:none; color:inherit; }
  .oko-card-img { width:100%; height: 210px; object-fit: cover; display:block; background:#f3f3f3; }
  .oko-card-body { padding:12px 14px; }
  .oko-title { font-weight:700; line-height:1.25; margin:6px 0 8px; color:#1c3faa; }
  .oko-title:hover { text-decoration:underline; }
  .oko-meta { font-size:.85rem; color:#6b7280; margin-bottom:8px; }
  .oko-excerpt { color:#333; font-size:.95rem; }
  .oko-sentinel { height: 1px; }
  `;
  const tag = document.createElement('style');
  tag.id = 'oko-home-inline-grid';
  tag.textContent = css;
  document.head.appendChild(tag);
}

function cardHTML(post) {
  const img = getFeaturedSrc(post);
  const title = stripHtml(post.title?.rendered);
  const date = prettyDate(post.date);
  const byline = stripHtml(post._embedded?.author?.[0]?.name || 'Oklahoma Observer');
  const excerpt = stripHtml(post.excerpt?.rendered).trim();
  const url = `./#/post/${post.id}`;

  return `
  <article class="oko-card">
    <a href="${url}" data-nav="post" data-id="${post.id}">
      ${img ? `<img class="oko-card-img" src="${img}" alt="${title}">` : `<div class="oko-card-img" role="img" aria-label="${title}"></div>`}
    </a>
    <div class="oko-card-body">
      <div class="oko-meta">By ${byline} — ${date}</div>
      <h3 class="oko-title">
        <a href="${url}" data-nav="post" data-id="${post.id}">${title}</a>
      </h3>
      ${excerpt ? `<p class="oko-excerpt">${excerpt}</p>` : ``}
    </div>
  </article>`;
}

/* ------------------------------- Home page -------------------------------- */

export async function home(app) {
  homeGridStylesOnce();

  // Skeleton
  app.innerHTML = `
    <section class="container" style="max-width:1200px;margin:0 auto;padding:20px 16px;">
      <h2 style="font-size:1.6rem;font-weight:800;margin:4px 0 14px;">Latest Posts</h2>
      <div id="oko-home-grid" class="oko-home-grid"></div>
      <div id="oko-sentinel" class="oko-sentinel"></div>
      <div id="oko-status" style="text-align:center;color:#6b7280;font-size:.95rem;padding:10px 0;"></div>
    </section>
  `;

  const grid = app.querySelector('#oko-home-grid');
  const status = app.querySelector('#oko-status');
  const sentinel = app.querySelector('#oko-sentinel');

  // Basic state
  const state = {
    page: 1,
    perPage: 18,
    loading: false,
    done: false,
    seen: new Set()
  };

  // Preserve scroll position across in-app navigation
  // (core router should not wipe scroll; this is a safety net)
  if (sessionStorage.getItem('oko-scroll-home')) {
    requestAnimationFrame(() => {
      const y = parseInt(sessionStorage.getItem('oko-scroll-home') || '0', 10);
      window.scrollTo(0, isNaN(y) ? 0 : y);
    });
  }
  const saveScroll = () => sessionStorage.setItem('oko-scroll-home', String(window.scrollY || 0));

  // Click delegation for tiles (image or title)
  grid.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-nav="post"]');
    if (!a) return;
    e.preventDefault();
    saveScroll();
    const id = a.getAttribute('data-id');
    window.location.hash = `#/post/${id}`;
  });

  async function loadPage() {
    if (state.loading || state.done) return;
    state.loading = true;
    status.textContent = 'Loading…';

    const endpoint = `${API_BASE}/wp-json/wp/v2/posts?status=publish&_embed=1&per_page=${state.perPage}&page=${state.page}&order=desc`;
    let posts = [];
    try {
      posts = await apiFetchJson(endpoint, { tries: 2 });
    } catch (err) {
      console.error('[Home] load failed:', err);
      status.textContent = 'Failed to fetch posts.';
      state.loading = false;
      return;
    }

    // Filter out cartoons and duplicates, then render
    const items = posts
      .filter(p => !isCartoonish(p))
      .filter(p => {
        if (state.seen.has(p.id)) return false;
        state.seen.add(p.id);
        return true;
      });

    if (items.length === 0 && posts.length === 0) {
      state.done = true;
      status.textContent = 'No more posts.';
      state.loading = false;
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach(p => {
      const div = document.createElement('div');
      div.innerHTML = cardHTML(p);
      frag.appendChild(div.firstElementChild);
    });
    grid.appendChild(frag);

    status.textContent = '';
    state.loading = false;

    // If we got fewer than requested (after filter), still try next page
    if (posts.length < state.perPage) {
      state.page += 1;
      if (posts.length === 0) {
        state.done = true;
        status.textContent = 'No more posts.';
      }
    } else {
      state.page += 1;
    }
  }

  // IntersectionObserver for infinite scroll
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        loadPage();
      }
    }
  }, { rootMargin: '800px 0px 800px 0px' });

  io.observe(sentinel);

  // Housekeeping on teardown when router swaps views
  const cleanup = () => {
    try { io.disconnect(); } catch {}
    window.removeEventListener('scroll', saveScroll, { passive: true });
  };
  window.addEventListener('scroll', saveScroll, { passive: true });
  app.__oko_destroy = cleanup;

  // Prime first page
  loadPage();
}

/* Default export for loaders that call mod.default(app) */
export default home;
