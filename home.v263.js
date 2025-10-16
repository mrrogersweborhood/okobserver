/* OkObserver · home.v263.js · v2.6.7 (click-safe+)
   - 4-column grid (uses .ok-grid from index.html)
   - Clickable image/title → #/post/{id} (delegated safely)
   - Click anywhere on card to navigate (no preventDefault)
   - Infinite scroll with IntersectionObserver
   - Filters out “cartoon/cartoons” posts
   - Self-contained (no external utils)
*/

const API_BASE = (window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2').replace(/\/+$/, '');

function joinUrl(base, path) {
  const b = (base || '').replace(/\/+$/, '');
  const p = (path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}
function qs(params = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach(x => u.append(k, x)); else u.append(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}
async function apiJSON(pathOrUrl, params, tries = 2) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl + qs(params) : joinUrl(API_BASE, pathOrUrl) + qs(params);
  let last;
  for (let i = 0; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
      if (i < tries) await new Promise(res => setTimeout(res, 250 * (i + 1)));
    }
  }
  throw last || new Error('Network error');
}
const prettyDate = iso => {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return iso || ''; }
};
const decode = (html = '') => {
  const d = document.createElement('div'); d.innerHTML = html; return d.textContent || d.innerText || '';
};
const featuredSrc = p => {
  const m = p._embedded?.['wp:featuredmedia']?.[0];
  return m?.media_details?.sizes?.medium_large?.source_url || m?.media_details?.sizes?.large?.source_url || m?.source_url || '';
};
const isCartoon = p => {
  const terms = (p._embedded?.['wp:term'] || []).flat();
  return terms.some(t => /cartoons?/i.test(String(t?.slug || t?.name || '')));
};

export default async function renderHome(app) {
  const mount = app || document.getElementById('app');
  mount.innerHTML = `
    <section class="ok-list">
      <h2 class="ok-h2" style="margin:.25rem 0 1rem">Latest Posts</h2>
      <div id="ok-grid" class="ok-grid" role="list"></div>
      <div id="ok-sentinel" class="sentinel" aria-hidden="true" style="height:1px"></div>
    </section>
  `;

  const grid = document.getElementById('ok-grid');
  const sentinel = document.getElementById('ok-sentinel');

  // Click delegation: allow natural hash navigation on anchors
  grid.addEventListener('click', (ev) => {
    // 1) If you clicked an anchor → let it work naturally
    const a = ev.target.closest('a[href^="#/post/"]');
    if (a) return; // do NOT preventDefault

    // 2) If you clicked somewhere else inside a card, navigate to its first link
    const card = ev.target.closest('.ok-card');
    if (!card) return;

    const firstLink = card.querySelector('a[href^="#/post/"]');
    if (firstLink) {
      // Avoid hijacking modified clicks
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      window.location.hash = firstLink.getAttribute('href');
    }
  });

  let page = 1;
  let loading = false;
  let done = false;
  const seen = new Set();

  async function loadPage() {
    if (loading || done) return;
    loading = true;

    try {
      const posts = await apiJSON('posts', { status: 'publish', _embed: 1, per_page: 18, page });
      if (!Array.isArray(posts) || posts.length === 0) {
        done = true; sentinel.remove(); return;
      }

      const visible = posts.filter(p => !isCartoon(p)).filter(p => {
        if (seen.has(p.id)) return false; seen.add(p.id); return true;
      });

      const frag = document.createDocumentFragment();
      visible.forEach(p => {
        const title = decode(p.title?.rendered || '(Untitled)');
        const img = featuredSrc(p);
        const author = p._embedded?.author?.[0]?.name || 'Oklahoma Observer';
        const date = prettyDate(p.date || p.date_gmt);
        const excerpt = decode((p.excerpt?.rendered || p.content?.rendered || '').replace(/<[^>]+>/g, '')).trim();

        const card = document.createElement('article');
        card.className = 'ok-card';
        card.setAttribute('role', 'listitem');
        card.innerHTML = `
          <a class="ok-card__media" href="#/post/${p.id}" aria-label="${title}" style="display:block;line-height:0">
            ${img
              ? `<img class="ok-thumb" src="${img}" alt="" style="pointer-events:auto;cursor:pointer;">`
              : `<div class="ok-thumb" style="background:#eef; aspect-ratio:16/9; pointer-events:auto;"></div>`}
          </a>
          <div class="ok-body">
            <h3 class="ok-title" style="margin-left:0.2rem">
              <a href="#/post/${p.id}" style="color:#153e90;text-decoration:none">${title}</a>
            </h3>
            <p class="ok-meta">By ${author} — ${date}</p>
            ${excerpt ? `<p class="ok-excerpt">${excerpt}</p>` : ''}
          </div>
        `;
        frag.appendChild(card);
      });
      grid.appendChild(frag);

      page += 1;
      if (posts.length < 18) { done = true; sentinel.remove(); }
    } catch (err) {
      console.error('[Home] load failed:', err);
      if (page === 1) grid.insertAdjacentHTML('beforeend', `<p class="error" style="color:#b00">Failed to fetch posts.</p>`);
      done = true; sentinel.remove();
    } finally {
      loading = false;
    }
  }

  await loadPage();

  const io = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadPage();
  }, { rootMargin: '900px 0px' });
  io.observe(sentinel);

  const saveScroll = () => sessionStorage.setItem('oko-scroll-home', String(window.scrollY || 0));
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/post/')) saveScroll(); });
  window.addEventListener('beforeunload', saveScroll);
}
