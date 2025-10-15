/* OkObserver · detail.v263.js · v2.6.5 (video-polish restored)
   What this does:
   - Detects Vimeo/YouTube in WP content
   - Shows featured-image poster with play overlay (no autoplay)
   - On click, swaps to the correct player (16:9, responsive)
   - No gray placeholders, no big whitespace gaps
   - Back to Posts at top & bottom
   - Safe cleanups for empty WP wrappers
   - Self-contained, no external imports
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
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl + qs(params)
    : joinUrl(API_BASE, pathOrUrl) + qs(params);
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const prettyDate = iso => {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return iso || ''; }
};
const decode = (html = '') => {
  const d = document.createElement('div'); d.innerHTML = html; return d.textContent || d.innerText || '';
};

function featuredSrc(post) {
  const fm = post?._embedded?.['wp:featuredmedia']?.[0];
  return (
    fm?.media_details?.sizes?.large?.source_url ||
    fm?.media_details?.sizes?.medium_large?.source_url ||
    fm?.source_url || ''
  );
}

// find first Vimeo/YouTube URL in content (anchor, plain text, or iframe src)
function extractVideoURL(html = '') {
  const div = document.createElement('div');
  div.innerHTML = html;

  // direct anchors
  for (const a of div.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (/vimeo\.com\/\d+/.test(href)) return href;
    if (/(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/.test(href)) return href;
  }
  // iframe embeds
  const f = div.querySelector('iframe[src*="vimeo.com"],iframe[src*="youtube.com"],iframe[src*="youtu.be"]');
  if (f) return f.getAttribute('src') || null;

  // plain text fallback
  const text = div.textContent || '';
  const vm = text.match(/https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/);
  if (vm) return vm[0];
  const yt = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return yt[0];

  return null;
}

function normalizePlayerSrc(url) {
  if (!url) return null;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  const yt    = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  if (yt)    return `https://www.youtube.com/embed/${yt[1]}`;
  return url; // already an embed
}

function posterHTML(src, title) {
  if (!src) return '';
  return `
    <div class="oko-video-poster" role="button" tabindex="0" aria-label="Play video">
      <img src="${src}" alt="${decode(title)}" class="oko-video-poster__img">
      <button class="oko-video-poster__play" aria-label="Play video">▶</button>
    </div>`;
}

function playerHTML(embedSrc) {
  if (!embedSrc) return '';
  return `
    <div class="oko-video-embed">
      <iframe
        src="${embedSrc}"
        title="Embedded video"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        referrerpolicy="no-referrer-when-downgrade"
        frameborder="0"></iframe>
    </div>`;
}

// remove empty WP structural junk that causes gray blocks/white gaps
function cleanWP(html = '') {
  return String(html)
    .replace(/<div[^>]*class=["'][^"']*mceTemp[^"']*["'][^>]*>.*?<\/div>/gis, '')
    .replace(/<figure[^>]*>\s*<\/figure>/gis, '')
    .replace(/<figcaption>\s*<\/figcaption>/gis, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gis, '');
}

// ---------- main ----------
export default async function renderDetail(app, idParam) {
  const mount = app || document.getElementById('app');
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!API_BASE) {
    mount.innerHTML = `<section class="page-error"><p>Page error: API base missing.</p></section>`;
    return;
  }
  if (!id) {
    mount.innerHTML = `<section class="page-error"><p>Page error: missing id.</p></section>`;
    return;
  }

  mount.innerHTML = `
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

  const $title = mount.querySelector('.post-title');
  const $meta  = mount.querySelector('.post-meta');
  const $media = mount.querySelector('.post-media');
  const $body  = mount.querySelector('.post-content');

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
  const contentRaw = post.content?.rendered || '';
  const content = cleanWP(contentRaw);

  // header
  $title.innerHTML = title;
  $meta.textContent = `By ${author} — ${date}`;

  // detect video + featured poster
  const vidURL  = extractVideoURL(contentRaw);
  const embed   = normalizePlayerSrc(vidURL);
  const poster  = featuredSrc(post);

  // media priority: if both poster+video → show poster w/ play; only video → show player; only poster → image.
  if (poster && embed) {
    $media.innerHTML = posterHTML(poster, decode(title));
    const posterEl = $media.querySelector('.oko-video-poster');
    const swap = () => { $media.innerHTML = playerHTML(embed); };
    posterEl?.addEventListener('click', swap);
    posterEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); swap(); }
    });
  } else if (embed) {
    $media.innerHTML = playerHTML(embed);
  } else if (poster) {
    $media.innerHTML = `<img src="${poster}" alt="" style="width:100%;height:auto;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);">`;
  } else {
    $media.innerHTML = ''; // nothing
  }

  // body rendering: keep WP HTML but ensure embeds are responsive and images are tidy
  $body.innerHTML = content
    .replaceAll('<iframe', '<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:1rem 0;"')
    .replaceAll('<img',    '<img loading="lazy" style="max-width:100%;height:auto;border-radius:10px;margin:1rem 0;"');

  // remove stray "Screenshot" paragraph placeholders (frequent WP copy artifact)
  $body.querySelectorAll('p').forEach(p => {
    if (/^\s*screenshot\s*$/i.test(p.textContent.trim())) p.remove();
  });

  // first paragraph de-indent
  const firstP = $body.querySelector('p');
  if (firstP) {
    firstP.innerHTML = firstP.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i, '').trimStart();
    firstP.style.textIndent = '0';
  }
}

/* ---------- detail page styles (coexists with your global CSS) ---------- */
const __once = 'oko-detail-video-style';
if (!document.getElementById(__once)) {
  const style = document.createElement('style');
  style.id = __once;
  style.textContent = `
  .oko-video-poster{position:relative;display:block;border-radius:12px;overflow:hidden;background:#000}
  .oko-video-poster__img{display:block;width:100%;height:auto;opacity:.98;transition:transform .18s ease, opacity .18s ease}
  .oko-video-poster:hover .oko-video-poster__img{transform:scale(1.01);opacity:1}
  .oko-video-poster__play{
    position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    border:0;border-radius:999px;padding:.7rem 1rem;font-size:1.05rem;
    background:#1e63ff;color:#fff;box-shadow:0 6px 16px rgba(0,0,0,.22);cursor:pointer
  }
  .oko-video-embed{position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000}
  .oko-video-embed iframe{position:absolute;inset:0;width:100%;height:100%}
  `;
  document.head.appendChild(style);
}
