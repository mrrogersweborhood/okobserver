// detail.v263.js — OkObserver Post Detail (v2.6.x, resilient & self-contained)

export default async function renderDetail(app, id) {
  // ---------- 1) Resolve API base safely (no race with main.js) ----------
  const apiBase =
    (typeof window !== 'undefined' && window.OKO_API_BASE) ||
    (document.querySelector('meta[name="oko-api-base"]')?.content) ||
    '';
  if (!apiBase) {
    console.error('[Detail] API base missing.');
    app.innerHTML = `
      <section class="page-error" style="max-width:960px;margin:3rem auto;padding:1rem;">
        <p><strong>Page error:</strong> API base missing.</p>
      </section>`;
    return;
  }
  if (!id) {
    app.innerHTML = `
      <section class="page-error" style="max-width:960px;margin:3rem auto;padding:1rem;">
        <p><strong>Page error:</strong> Missing post id.</p>
      </section>`;
    return;
  }

  // ---------- 2) Helpers ----------
  const fetchJSON = async (url) => {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric'
    });

  const backLink = `<a href="#/" class="back-link" style="color:#1e63ff;text-decoration:none;">← Back to Posts</a>`;

  // ---------- 3) Shell (so users see immediate structure) ----------
  app.innerHTML = `
    <article class="post-detail" style="max-width:900px;margin:2rem auto;padding:0 1rem;">
      <div class="back top" style="margin:.25rem 0 1rem 0">${backLink}</div>
      <header class="post-header" style="margin-bottom:1rem;">
        <h1 class="post-title" style="margin:.25rem 0 .4rem 0;line-height:1.2;">Loading…</h1>
        <div class="post-meta" style="color:#555;font-size:.95rem;"></div>
      </header>
      <figure class="post-media" style="margin:0 0 1.25rem 0;"></figure>
      <div class="post-content" style="line-height:1.7;font-size:1.05rem;color:#222;">Please wait…</div>
      <div class="back bottom" style="margin:1.75rem 0 1rem 0">${backLink}</div>
    </article>
  `;

  const $title = app.querySelector('.post-title');
  const $meta  = app.querySelector('.post-meta');
  const $media = app.querySelector('.post-media');
  const $body  = app.querySelector('.post-content');

  // ---------- 4) Fetch post with embeds (author, media) ----------
  let post;
  try {
    post = await fetchJSON(`${apiBase}/wp-json/wp/v2/posts/${encodeURIComponent(id)}?_embed=1`);
  } catch (err) {
    console.error('[Detail] fetch failed:', err);
    $body.innerHTML = `<p class="error">Failed to load post. ${err?.message || err}</p>`;
    return;
  }

  // ---------- 5) Populate header/meta ----------
  const title = post.title?.rendered || 'Untitled';
  const author =
    post._embedded?.author?.[0]?.name ||
    post._embedded?.author?.[0]?.slug ||
    '—';
  const date = post.date ? fmtDate(post.date) : '';

  $title.innerHTML = title;
  $meta.textContent = `By ${author}${date ? ` — ${date}` : ''}`;

  // ---------- 6) Featured image or video embed ----------
  // Try featured image first
  const fm = post._embedded?.['wp:featuredmedia']?.[0];
  const featured =
    fm?.media_details?.sizes?.large?.source_url ||
    fm?.media_details?.sizes?.medium_large?.source_url ||
    fm?.source_url ||
    '';

  // Check for Vimeo/YouTube URLs inside content to embed player
  const contentHTML = post.content?.rendered || '';
  const vimeo = contentHTML.match(/https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/);
  const yt    = contentHTML.match(/https?:\/\/(?:www\.)?youtu(?:\.be|be\.com)\/(?:watch\?v=)?([A-Za-z0-9_-]{6,})/);

  let mediaHTML = '';
  if (vimeo) {
    const vid = vimeo[1];
    mediaHTML = `
      <div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000;">
        <iframe
          src="https://player.vimeo.com/video/${vid}?title=0&byline=0&portrait=0"
          style="position:absolute;inset:0;border:0;width:100%;height:100%;"
          allow="autoplay; fullscreen; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>`;
  } else if (yt) {
    const vid = yt[1];
    mediaHTML = `
      <div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000;">
        <iframe
          src="https://www.youtube.com/embed/${vid}"
          style="position:absolute;inset:0;border:0;width:100%;height:100%;"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>`;
  } else if (featured) {
    mediaHTML = `
      <img src="${featured}" alt="" style="width:100%;height:auto;border-radius:12px;display:block;box-shadow:0 1px 3px rgba(0,0,0,.08);" />`;
  }
  $media.innerHTML = mediaHTML;

  // ---------- 7) Body HTML + cleanups ----------
  // Keep publisher HTML, but ensure embeds/images are responsive & rounded.
  const safe = contentHTML
    .replaceAll('<iframe', '<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border-radius:10px;margin:1rem 0;"')
    .replaceAll('<img', '<img loading="lazy" style="max-width:100%;height:auto;border-radius:10px;margin:1rem 0;"');
  $body.innerHTML = safe;

  // Remove empty WP placeholders that can leave gray boxes
  $body.querySelectorAll('.mceTemp, .wp-block:empty, .wp-block-image:empty, .wp-block-video:empty').forEach(n => n.remove());

  // First paragraph shouldn’t be indented even if WP inserted &nbsp;/<br>
  const firstP = $body.querySelector('p');
  if (firstP) {
    firstP.innerHTML = firstP.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i, '').trimStart();
    firstP.style.textIndent = '0';
  }

  // Ensure all images get lazy/async hints
  $body.querySelectorAll('img').forEach(img => {
    if (!img.hasAttribute('loading')) img.loading = 'lazy';
    if (!img.hasAttribute('decoding')) img.decoding = 'async';
    img.style.maxWidth = img.style.maxWidth || '100%';
    img.style.height = img.style.height || 'auto';
    img.style.borderRadius = img.style.borderRadius || '10px';
  });
}
