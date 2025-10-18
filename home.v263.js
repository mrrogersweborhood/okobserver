/* OkObserver — Home view (post summary grid)
   FULL FILE — restores reliable click-to-detail without touching other views
   - Cards render with anchors: href="#/post/:id"
   - Stretched-link pattern: whole card is clickable
   - Event delegation on #ok-grid/.ok-grid
   - Keeps console logs
*/

const log = (...a) => console.log('[Home]', ...a);

// Helpers expected in your app environment
const Module = (window.Module = window.Module || {});
const apiJSON = window.apiJSON || Module.apiJSON;
const API_BASE = window.API_BASE || Module.API_BASE;

// Local decode so we don't depend on utils exports
const decode = (s='') => { const t=document.createElement('textarea'); t.innerHTML=s; return t.value; };

function prettyDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
  } catch { return ''; }
}

function featuredSrc(post) {
  const m = post?._embedded?.['wp:featuredmedia']?.[0];
  return (
    m?.media_details?.sizes?.medium_large?.source_url ||
    m?.media_details?.sizes?.large?.source_url ||
    m?.source_url || ''
  );
}

/* Card HTML with safe stretched link — clicking anywhere routes to detail */
function cardHTML(post) {
  const id = post.id;
  const title = decode(post.title?.rendered || '(Untitled)');
  const date  = prettyDate(post.date || post.date_gmt);
  const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const img = featuredSrc(post);
  const excerpt = (post.excerpt?.rendered || '').replace(/<\/?[^>]+(>|$)/g, '').trim();

  return `
    <article class="ok-card" data-id="${id}" role="listitem" style="position:relative">
      ${img ? `<div class="post-thumb"><img src="${img}" alt="" loading="lazy"></div>` : ''}
      <div class="card-body">
        <h2 class="post-title"><a href="#/post/${id}">${title}</a></h2>
        <div class="meta" style="color:#5b6470;font-size:.9rem">By ${author} — ${date}</div>
        ${excerpt ? `<p class="post-excerpt">${excerpt}</p>` : ''}
      </div>

      <!-- stretched link: makes whole card clickable without blocking focus -->
      <a class="stretched-link" href="#/post/${id}"
         aria-label="${title.replace(/"/g,'&quot;')}"
         style="position:absolute;inset:0;z-index:1;text-decoration:none;"></a>
    </article>
  `;
}

/* Render the grid of posts */
async function renderGrid(mount, posts) {
  // Ensure the canonical grid container exists and is used
  let grid = mount.querySelector('#ok-grid, .ok-grid');
  if (!grid) {
    grid = document.createElement('div');
    grid.id = 'ok-grid';
    grid.className = 'ok-grid';
    grid.setAttribute('role', 'list');
    mount.appendChild(grid);
  }

  grid.innerHTML = posts.map(cardHTML).join('');

  // Event delegation: any click on anchors inside grid navigates
  grid.addEventListener('click', (e) => {
    // ignore modified clicks (new tab, etc.)
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const a = e.target.closest('a[href^="#/post/"]');
    if (!a) return;
    const m = a.getAttribute('href').match(/#\/post\/(\d+)/);
    if (!m) return;

    e.preventDefault();
    const id = m[1];
    // Route via hash (your router listens to this)
    window.location.hash = `#/post/${id}`;
  }, { passive:false });
}

/* PUBLIC ENTRY */
export default async function renderHome(mountOrId){
  log('renderHome start', mountOrId);

  // Resolve mount
  let mount;
  if (mountOrId instanceof Element) {
    mount = mountOrId;
  } else if (typeof mountOrId === 'string' && document.getElementById(mountOrId)) {
    mount = document.getElementById(mountOrId);
  } else {
    mount = document.getElementById('app') || document.body;
  }

  if (!apiJSON || !API_BASE) {
    mount.innerHTML = `
      <section class="ok-card" style="max-width:980px;margin:1rem auto;padding:12px 16px">
        <p class="error" style="color:#b00">API not ready.</p>
      </section>`;
    console.error('[Home] Missing apiJSON or API_BASE');
    return;
  }

  // Loading shell
  mount.innerHTML = `
    <section style="max-width:980px;margin:1rem auto;padding:12px 16px">
      <p>Loading posts…</p>
    </section>`;

  // Fetch posts (keep your existing query; adjust per your app’s needs)
  let posts = [];
  try {
    posts = await apiJSON('posts', { _embed: 1, per_page: 20 });
    log('fetched posts', posts?.length || 0);
  } catch (err) {
    console.error('[Home] fetch failed', err);
    mount.innerHTML = `
      <section class="ok-card" style="max-width:980px;margin:1rem auto;padding:12px 16px">
        <p class="error" style="color:#b00">Failed to load posts.</p>
      </section>`;
    return;
  }

  // Render grid
  await renderGrid(mount, posts);

  log('renderHome done');
}
