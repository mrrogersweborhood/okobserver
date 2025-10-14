// detail.v263.js — post detail view (stable)

// Utility: small fetch with retry (no dependency on another file)
async function fetchWithRetry(url, opt = {}, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opt);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { last = e; }
  }
  throw last || new Error('Fetch failed');
}

function esc(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export default async function renderDetail(root, id) {
  // Ensure API base is available
  const API_BASE = window.OKO && window.OKO.API_BASE;
  if (!API_BASE) {
    console.error('[Detail] API base missing.');
    throw new Error('API base missing.');
  }
  if (!root) throw new Error('Root element missing');
  if (!id)  throw new Error('Post ID missing');

  root.innerHTML = `
    <div class="container mx-auto px-4 py-6 max-w-5xl">
      <a href="#/" class="inline-block mb-4 text-indigo-600 hover:underline">&larr; Back to Posts</a>
      <div id="detail-shell" class="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
        <div class="p-6">
          <div class="text-neutral-500 text-sm" id="meta">Loading…</div>
          <h1 id="title" class="text-3xl mt-1 mb-4 font-semibold text-neutral-900"></h1>
          <div id="media" class="mb-6"></div>
          <article id="content" class="prose prose-neutral max-w-none"></article>
        </div>
      </div>
      <a href="#/" class="inline-block mt-6 text-indigo-600 hover:underline">&larr; Back to Posts</a>
    </div>
  `;

  const shell   = root.querySelector('#detail-shell');
  const metaEl  = root.querySelector('#meta');
  const titleEl = root.querySelector('#title');
  const mediaEl = root.querySelector('#media');
  const contEl  = root.querySelector('#content');

  try {
    // include _embed so we can show featured media/video poster
    const post = await fetchWithRetry(`${API_BASE}/posts/${id}?_embed=1`, {}, 2);

    // title / meta
    titleEl.innerHTML = post.title?.rendered || '(Untitled)';
    const author = (post._embedded?.author?.[0]?.name) || 'Oklahoma Observer';
    const date   = new Date(post.date);
    metaEl.textContent = `By ${author} — ${date.toLocaleDateString(undefined, { month:'long', day:'numeric', year:'numeric' })}`;

    // media (prefer featured image; fall back to first image in content)
    mediaEl.innerHTML = '';
    let mediaHTML = '';

    const fm = post._embedded?.['wp:featuredmedia']?.[0];
    const videoPoster = (() => {
      // If the content contains a Vimeo/YouTube link with an <img>, keep the image and suppress duplicate
      const tmp = document.createElement('div');
      tmp.innerHTML = post.content?.rendered || '';
      const firstImg = tmp.querySelector('img');
      return firstImg ? firstImg.getAttribute('src') : null;
    })();

    if (fm?.source_url) {
      mediaHTML = `
        <figure class="overflow-hidden rounded-xl border border-neutral-200">
          <img src="${esc(fm.source_url)}" alt="${esc(fm.alt_text || '')}" style="width:100%;height:auto;display:block"/>
        </figure>
      `;
    } else if (videoPoster) {
      mediaHTML = `
        <figure class="overflow-hidden rounded-xl border border-neutral-200">
          <img src="${esc(videoPoster)}" alt="" style="width:100%;height:auto;display:block"/>
        </figure>
      `;
    }

    if (mediaHTML) mediaEl.innerHTML = mediaHTML;

    // content (keep publisher HTML but tidy leading indentation)
    let html = post.content?.rendered || '';
    html = html.replace(/^\s+/, ''); // trim accidental leading whitespace
    contEl.innerHTML = html;

    // soften shell edge
    shell.style.borderColor = 'rgba(0,0,0,0.08)';
  } catch (err) {
    console.error('[Detail] failed', err);
    shell.innerHTML = `<div class="p-6 text-red-600">Failed to load post: ${esc(err.message || err)}</div>`;
  }
}
