// home.v263.js  (v2.6.x)
// Renders the Latest Posts grid. Image + title are clickable and route to #/post/{id}.

const API = (window.OKO && window.OKO.API_BASE) || '';
const PER_PAGE = 18;

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch { return ''; }
}

function getAuthor(post) {
  const a = post._embedded && post._embedded.author && post._embedded.author[0];
  return a && (a.name || a.slug) ? a.name || a.slug : 'Oklahoma Observer';
}

function getFeatured(post) {
  const media = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
  const src =
    (media && media.media_details && media.media_details.sizes &&
     (media.media_details.sizes.medium_large?.source_url ||
      media.media_details.sizes.large?.source_url ||
      media.media_details.sizes.full?.source_url)) ||
    (media && media.source_url) ||
    '';
  const alt = (media && (media.alt_text || media.title?.rendered)) || post.title?.rendered || '';
  return { src, alt };
}

function isCartoon(post) {
  // Basic guard to keep cartoons off the main grid (id/name checks if you use a category)
  const cats = post._embedded && post._embedded['wp:term'] ? post._embedded['wp:term'].flat() : [];
  return cats.some(c => /cartoon/i.test(c.name || ''));
}

function cardHTML(post) {
  const { id, title, excerpt, date } = post;
  const { src, alt } = getFeatured(post);
  const url = `#/post/${id}`;
  return `
  <article class="post-card">
    <a class="post-thumb-link" href="${url}" aria-label="Open ${title.rendered.replace(/"/g,'&quot;')}">
      ${src ? `<img class="post-thumb" loading="lazy" src="${src}" alt="${alt.replace(/"/g,'&quot;')}" />` : `<div class="post-thumb placeholder"></div>`}
    </a>
    <h3 class="post-title"><a class="post-title-link" href="${url}">${title.rendered}</a></h3>
    <div class="post-meta">By ${getAuthor(post)} • ${fmtDate(date)}</div>
    <div class="post-excerpt">${excerpt && excerpt.rendered ? excerpt.rendered : ''}</div>
  </article>`;
}

function styles() {
  return `
  <style id="home-grid-styles">
    .grid { display:grid; gap:18px; grid-template-columns:repeat(4, minmax(0,1fr)); }
    @media (max-width: 1200px){ .grid{ grid-template-columns:repeat(3, minmax(0,1fr)); } }
    @media (max-width: 900px){ .grid{ grid-template-columns:repeat(2, minmax(0,1fr)); } }
    @media (max-width: 560px){ .grid{ grid-template-columns:1fr; } }
    .post-card{ background:#fff; border:1px solid #e6e6ef; border-radius:12px; overflow:hidden; box-shadow:0 1px 2px rgb(16 24 40 / 6%); }
    .post-thumb{ width:100%; height:auto; display:block; aspect-ratio: 16/11; object-fit:cover; }
    .post-thumb.placeholder{ background:#f2f4f7; height: 220px; }
    .post-thumb-link{ display:block; }
    .post-title{ margin:12px 16px 4px; font-size:1.05rem; line-height:1.35; }
    .post-title a{ text-decoration:none; color:#1f3a8a; }
    .post-title a:hover{ text-decoration:underline; }
    .post-meta{ margin:0 16px 8px; font-size:.85rem; color:#667085; }
    .post-excerpt{ margin:0 16px 16px; color:#344054; }
    .sentinel{ height:1px; }
  </style>`;
}

async function fetchPage(page) {
  const url = `${API}/posts?status=publish&_embed=1&per_page=${PER_PAGE}&page=${page}`;
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  return res.json();
}

export default async function renderHome(root) {
  if (!API) throw new Error('[Home] API base missing.');

  root.innerHTML = `
    ${document.getElementById('home-grid-styles') ? '' : styles()}
    <section class="home">
      <h2>Latest Posts</h2>
      <div class="grid" id="grid"></div>
      <div class="sentinel" id="sentinel"></div>
    </section>
  `;

  const grid = root.querySelector('#grid');
  const sentinel = root.querySelector('#sentinel');

  let page = 1;
  let loading = false;
  let done = false;

  async function load() {
    if (loading || done) return;
    loading = true;
    try {
      const items = await fetchPage(page);
      // Filter out cartoons (optional — remove if you want them)
      const filtered = items.filter(p => !isCartoon(p));
      grid.insertAdjacentHTML('beforeend', filtered.map(cardHTML).join(''));
      page += 1;
      if (items.length < PER_PAGE) done = true;
    } catch (e) {
      console.error('[Home] load failed', e);
      if (!grid.children.length) {
        grid.insertAdjacentHTML('beforeend', `<p style="color:#c00">Failed to fetch posts: ${e.message}</p>`);
        done = true;
      }
    } finally {
      loading = false;
    }
  }

  // Kick off initial load
  await load();

  // Infinite scroll
  const io = new IntersectionObserver((entries) => {
    const last = entries[0];
    if (last.isIntersecting) load();
  }, { rootMargin: '800px 0px 800px 0px' });

  io.observe(sentinel);
}
