// detail.v263.js — full file replacement
// NOTE: This keeps your existing global helpers/utilities untouched:
// - apiJSON, featuredSrc, extractVideoURL, normalizePlayer, playerHTML,
//   backButtonHTML, prettyDate, decode, stripEmptyBlocks
// It only restores poster-with-play overlay (no autoplay) and neat DOM init.

export default async function renderDetail(a, b) {
  // Resolve mount + id (same logic style you’ve been using)
  let mount, id;
  const looksLikeId = x => (typeof x === 'string' || typeof x === 'number') && /^\d+$/.test(String(x).trim());

  if (a instanceof Element || (typeof a === 'string' && (document.getElementById(a) || /^[.#\[]/.test(a)))) {
    mount = a instanceof Element ? a : document.querySelector(a);
    id = Array.isArray(b) ? b[0] : b;
  } else {
    mount = document.getElementById('app') || document.body;
    id = Array.isArray(a) ? a[0] : a;
  }
  if (!id && looksLikeId(a)) id = a;

  // Guardrails for API base / id
  if (!window.API_BASE && typeof API_BASE === 'undefined') {
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1.25rem auto;padding:1rem"><p class="error" style="color:#b00">API base missing.</p></section>`;
    console.warn('[Detail] API base missing');
    return;
  }

  if (!id) {
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1.25rem auto;padding:1rem"><p class="error" style="color:#b00">Page error: missing id.</p></section>`;
    console.warn('[Detail] Missing id');
    return;
  }

  // Fetch FIRST (no UI flicker)
  let post;
  try {
    post = await apiJSON(`posts/${encodeURIComponent(id)}`, { _embed: 1 });
  } catch (err) {
    console.error('[Detail] fetch failed', err);
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1.25rem auto;padding:1rem">
      <p class="error" style="color:#b00">Failed to load post.</p>
      <p><a class="oko-btn-back" href="#/">← Back to Posts</a></p>
    </section>`;
    return;
  }

  // ---------- Helpers (local to this file) ----------
  function buildMedia(p) {
    const title = (p.title && p.title.rendered) ? p.title.rendered : '';
    const poster = featuredSrc(p);                 // external helper
    const rawContent = p.content?.rendered || '';
    const videoUrl = extractVideoURL(rawContent);  // external helper
    const embed = videoUrl ? normalizePlayer(videoUrl) : null; // {type, src, html}

    // If we don't detect a supported embed, just render the poster (if any)
    if (!embed && poster) {
      return `
        <figure class="post-media">
          <img class="oko-detail-img" src="${poster}" alt="" loading="lazy">
        </figure>`;
    }

    // If we have both poster and embed (non-Facebook), show poster FIRST with play overlay.
    if (embed && poster && embed.type !== 'facebook') {
      const safeTitle = decode(title || '');
      return `
        <figure class="post-media">
          <button class="oko-video-poster" type="button" aria-label="Play video: ${safeTitle}">
            <img src="${poster}" alt="" loading="lazy" class="oko-detail-img">
            <span class="oko-play"></span>
          </button>
        </figure>`;
    }

    // Otherwise render the player immediately (Facebook or no poster)
    return `<figure class="post-media">${playerHTML(embed)}</figure>`;
  }

  function tidyFirstParagraph(container) {
    const firstP = container.querySelector('.post-content p');
    if (firstP) {
      firstP.innerHTML = firstP.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i, '').trimStart();
      firstP.style.textIndent = '0';
    }
  }
  // ---------- /Helpers ----------

  // Data prep
  const rawTitle  = post.title?.rendered || '(Untitled)';
  const author    = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date      = prettyDate(post.date || post.date_gmt);
  const mediaHTML = buildMedia(post);

  // Content sanitization/light normalizations
  let content = stripEmptyBlocks(post.content?.rendered || '')
    .replaceAll('<iframe', '<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px;margin:1rem 0;"')
    .replaceAll('<img',    '<img loading="lazy" style="max-width:100%;height:auto;border-radius:12px;margin:1rem 0;"');

  // Render the full article at once (prevents header/byline jumpiness)
  mount.innerHTML = `
    <article class="post-detail">
      <div class="oko-actions-top">${backButtonHTML()}</div>
      ${mediaHTML}
      <header class="post-header">
        <h1 class="post-title">${rawTitle}</h1>
        <div class="post-meta">By ${author} — ${date}</div>
      </header>
      <div class="post-content">${content}</div>
      <div class="oko-actions-bottom" style="margin-top:1.1rem">${backButtonHTML()}</div>
    </article>
  `;

  // Wire up: poster click → swap to player (no autoplay until user click)
  const posterBtn = mount.querySelector('.oko-video-poster');
  if (posterBtn) {
    posterBtn.addEventListener('click', () => {
      const fig = posterBtn.closest('.post-media');
      const rawContent = post.content?.rendered || '';
      const url        = extractVideoURL(rawContent);
      const embed      = url ? normalizePlayer(url) : null;
      if (fig && embed) fig.innerHTML = playerHTML(embed);
    }, { once: true });
  }

  // Hash-nav for back buttons (keeps behavior local to article)
  mount.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav="back"]');
    if (b) { e.preventDefault(); window.location.hash = '#/'; }
  });

  // Clean up first paragraph lead spaces/nbsp
  tidyFirstParagraph(mount);
}

/* Minimal CSS expectations (kept here as comments; you already have override.css rules)
.oko-video-poster { position:relative; display:inline-block; border:0; padding:0; background:transparent; cursor:pointer; max-width:100%; border-radius:12px; overflow:hidden; }
.oko-video-poster img { display:block; width:100%; height:auto; }
.oko-video-poster .oko-play { position:absolute; inset:0; display:grid; place-items:center; }
.oko-video-poster .oko-play::after { content:""; width:64px; height:64px; border-radius:50%; background:rgba(0,0,0,.45); box-shadow:0 2px 10px rgba(0,0,0,.25); display:block; position:relative; }
.oko-video-poster .oko-play::before { content:""; position:absolute; width:0; height:0; border-left:18px solid #fff; border-top:10px solid transparent; border-bottom:10px solid transparent; transform:translate(8px,0); }
.post-media iframe { width:100%; aspect-ratio:16/9; border:0; border-radius:12px; }
*/
