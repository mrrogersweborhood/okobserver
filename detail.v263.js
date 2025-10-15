/* OkObserver · detail.v263.js · v2.6.5
   - Renders single post by ID (#/post/{id})
   - Featured image or embedded video
   - Back to Posts links (top & bottom)
   - Soft card styling (works with index.html defaults)
   - No external utils
*/

// ---------- helpers ----------
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
async function apiJSON(pathOrUrl, params) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl + qs(params) : joinUrl(API_BASE, pathOrUrl) + qs(params);
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const prettyDate = iso => {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return iso || ''; }
};
// --------------------------------

export default async function renderDetail(app, idParam) {
  const appEl = app || document.getElementById('app');
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!API_BASE) {
    appEl.innerHTML = `<section class="page-error"><p>Page error: API base missing.</p></section>`;
    return;
  }
  if (!id) {
    appEl.innerHTML = `<section class="page-error"><p>Page error: missing id.</p></section>`;
    return;
  }

  appEl.innerHTML = `
    <article class="post-detail">
      <a class="back-link" href="#/">← Back to Posts</a>
      <header class="post-header">
        <h1 class="post-title" style="margin:.5rem 0">Loading…</h1>
        <div class="post-meta" style="color:#666"></div>
      </header>
      <figure class="post-media" style="margin:0 0 1rem 0"></figure>
      <div class="post-content" style="line-height:1.7">Please wait…</div>
      <div style="margin-top:1.5rem"><a class="back-link" href="#/">← Back to Posts</a></div>
    </article>
  `;

  const $title = appEl.querySelector('.post-title');
  const $meta  = appEl.querySelector('.post-meta');
  const $media = appEl.querySelector('.post-media');
  const $body  = appEl.querySelector('.post-content');

  let post;
  try {
    post = await apiJSON(`posts/${encodeURIComponent(id)}`, { _embed: 1 });
  } catch (e) {
    console.error('[Detail] fetch failed', e);
    $body.innerHTML = `<p class="error" style="color:#b00">Failed to load post.</p>`;
    return;
  }

  const title  = post.title?.rendered || '(Untitled)';
  const author = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date   = prettyDate(post.date || post.date_gmt);

  $title.innerHTML = title;
  $meta.textContent = `By ${author} — ${date}`;

  // Featured media
  const fm = post._embedded?.['wp:featuredmedia']?.[0];
  const featured =
    fm?.media_details?.sizes?.large?.source_url ||
    fm?.media_details?.sizes?.medium_large?.source_url ||
    fm?.source_url || '';

  const content = String(post.content?.rendered || '');

  // Very light cleanup: remove empty WP placeholders
  const cleaned = content
    .replace(/<div[^>]*class=["'][^"']*mceTemp[^"']*["'][^>]*>.*?<\/div>/gis, '')
    .replace(/<figure[^>]*>\s*<\/figure>/gis, '')
    .replace(/<figcaption>\s*<\/figcaption>/gis, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gis, '');

  // Render media (image above body)
  $media.innerHTML = featured ? `<img src="${featured}" alt="" style="width:100%;height:auto;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);">` : '';

  // Render body with safe defaults for embeds/images
  $body.innerHTML = cleaned
    .replaceAll('<iframe', '<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:1rem 0;"')
    .replaceAll('<img', '<img loading="lazy" style="max-width:100%;height:auto;border-radius:10px;margin:1rem 0;"');

  // First paragraph de-indent if WP left nbsp/br
  const firstP = $body.querySelector('p');
  if (firstP) {
    firstP.innerHTML = firstP.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i, '').trimStart();
    firstP.style.textIndent = '0';
  }

  // External links open in new tab
  $body.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (!href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
      a.target = '_blank'; a.rel = 'noopener';
    }
  });
}
