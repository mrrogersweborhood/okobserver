/* OkObserver — Detail view (stable media block + byline under title) */
export default async function renderDetail(mountOrId, maybeId) {
  const app = document.getElementById('app') || document.body;

  // Resolve mount + id robustly
  let mount, id;
  const looksId = v => (typeof v === 'string' || typeof v === 'number') && /^\d+$/.test(String(v).trim());
  if (mountOrId instanceof Element) {
    mount = mountOrId;
    id = Array.isArray(maybeId) ? maybeId[0] : maybeId;
  } else if (typeof mountOrId === 'string' && (document.getElementById(mountOrId) || /^[.#\[]/.test(mountOrId))) {
    mount = document.querySelector(mountOrId);
    id = Array.isArray(maybeId) ? maybeId[0] : maybeId;
  } else {
    mount = app;
    id = Array.isArray(mountOrId) ? mountOrId[0] : mountOrId;
  }
  if (!id && looksId(mountOrId)) id = mountOrId;

  // Guard: API
  const API = (window.API_BASE || '').trim();
  if (!API || !window.apiJSON) {
    mount.innerHTML = `<section class="page-error"><p>API base missing.</p><p><a class="oko-btn-back" href="#/">← Back to Posts</a></p></section>`;
    return;
  }

  // Fetch post
  let post;
  try {
    post = await window.apiJSON(`posts/${encodeURIComponent(id)}`, { _embed: 1 });
  } catch (err) {
    console.error('[Detail] fetch failed', err);
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1rem auto;padding:1rem">
      <p class="error" style="color:#b00">Failed to load post.</p>
      <p><a class="oko-btn-back" href="#/">← Back to Posts</a></p>
    </section>`;
    return;
  }

  // Helpers
  const decode = (s='') => {
    const d = document.createElement('textarea'); d.innerHTML = s; return d.value;
  };
  const prettyDate = (iso) => {
    try { return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}); }
    catch { return ''; }
  };
  const stripEmptyBlocks = (html='') =>
    html.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');

  // Featured image
  const featuredSrc = (p) => {
    const m = p._embedded?.['wp:featuredmedia']?.[0];
    return m?.source_url || '';
  };

  // Extract first video-like URL from content for inline embed
  const extractVideoURL = (html='') => {
    // Look for raw URLs in content that are common embeds (facebook, youtube, vimeo)
    const urlRE = /https?:\/\/[^\s"'<>]+/gi;
    const matches = html.match(urlRE) || [];
    return matches.find(u =>
      /facebook\.com\/.+\/videos\/|youtube\.com\/watch|youtu\.be\/|vimeo\.com\//i.test(u)
    ) || '';
  };

  const normalizePlayer = (url) => {
    if (/facebook\.com\/.+\/videos\//i.test(url)) {
      return { type: 'facebook', url };
    }
    if (/youtu\.be\/|youtube\.com\/watch/i.test(url)) {
      // YouTube embed
      let id = '';
      try {
        if (url.includes('youtu.be/')) id = url.split('youtu.be/')[1].split(/[?&]/)[0];
        else id = new URL(url).searchParams.get('v') || '';
      } catch {}
      return id ? { type: 'youtube', url: `https://www.youtube.com/embed/${id}` } : null;
    }
    if (/vimeo\.com\//i.test(url)) {
      // Vimeo simple embed — keep original URL, the player accepts video url too
      return { type: 'vimeo', url };
    }
    return null;
  };

  // Build media block
  const title = decode(post.title?.rendered || '(Untitled)');
  const author = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date = prettyDate(post.date || post.date_gmt);
  const poster = featuredSrc(post);
  const contentRaw = post.content?.rendered || '';
  const videoURL = extractVideoURL(contentRaw);
  const embed = videoURL ? normalizePlayer(videoURL) : null;

  const playerHTML = (e) => {
    if (!e) return '';
    if (e.type === 'facebook') {
      // Facebook inline embed via iframe wrapper that FB upgrades (works without SDK in most cases)
      return `
        <div class="post-media" style="margin:0 0 1rem">
          <iframe
            src="https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(e.url)}&show_text=0&width=900"
            style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;overflow:hidden"
            scrolling="no" frameborder="0" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share">
          </iframe>
        </div>`;
    }
    if (e.type === 'youtube') {
      return `
        <div class="post-media" style="margin:0 0 1rem">
          <iframe
            src="${e.url}"
            allowfullscreen
            style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px"></iframe>
        </div>`;
    }
    if (e.type === 'vimeo') {
      // Let vimeo render its responsive player
      return `
        <div class="post-media" style="margin:0 0 1rem">
          <iframe
            src="https://player.vimeo.com/video/${e.url.replace(/.*vimeo\.com\//,'').split(/[?#]/)[0]}"
            allow="autoplay; fullscreen; picture-in-picture"
            allowfullscreen
            style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px"></iframe>
        </div>`;
    }
    return '';
  };

  const posterHTML = (src, alt='') => `
    <figure class="post-media" style="margin:0 0 1rem;position:relative">
      <img src="${src}" alt="${alt}" class="oko-detail-img" style="width:100%;height:auto;border-radius:12px;display:block">
      <button class="oko-video-poster" aria-label="Play video"
        style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;border:0">
        <span style="
          display:inline-block;width:74px;height:74px;border-radius:50%;
          background:rgba(0,0,0,.45);backdrop-filter:saturate(140%) blur(1px);
          box-shadow:0 6px 20px rgba(0,0,0,.25);">
          <svg viewBox='0 0 100 100' width='74' height='74' role='img' aria-hidden='true'>
            <circle cx='50' cy='50' r='48' fill='none'></circle>
            <polygon points='40,32 72,50 40,68' fill='#fff'></polygon>
          </svg>
        </span>
      </button>
    </figure>
  `;

  // Decide media HTML:
  // - If Facebook/YouTube/Vimeo link exists: render player inline immediately.
  // - Else if poster image exists: render poster with big play overlay and swap to player on click (no player url => no overlay).
  let mediaHTML = '';
  if (embed) {
    mediaHTML = playerHTML(embed); // inline player immediately
  } else if (poster) {
    // poster only (no discovered video): just image
    mediaHTML = posterHTML(poster, title);
  }

  // Content sanitization (keep images responsive)
  let content = stripEmptyBlocks(contentRaw)
    .replaceAll('<iframe','<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:1rem 0;"')
    .replaceAll('<img','<img loading="lazy" style="max-width:100%;height:auto;border-radius:10px;margin:1rem 0;"');

  // Compose DOM
  mount.innerHTML = `
    <article class="post-detail">
      <div class="oko-actions-top"><a href="#/" class="oko-btn-back">← Back to Posts</a></div>
      ${mediaHTML || ''}
      <header class="post-header" style="margin:.25rem 0 0">
        <h1 class="post-title">${title}</h1>
        <div class="post-meta">By ${author} — ${date}</div>
      </header>
      <div class="post-content">${content}</div>
      <div class="oko-actions-bottom" style="margin-top:1.1rem"><a href="#/" class="oko-btn-back">← Back to Posts</a></div>
    </article>
  `;

  // If we rendered poster + we actually have a playable embed type, wire the swap
  if (!embed && poster) {
    const possible = normalizePlayer(extractVideoURL(contentRaw));
    if (possible) {
      const posterBtn = mount.querySelector('.oko-video-poster');
      if (posterBtn) {
        const swap = () => {
          const fig = posterBtn.closest('.post-media');
          if (fig) fig.outerHTML = playerHTML(possible);
        };
        posterBtn.addEventListener('click', swap);
        posterBtn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); swap(); }
        });
      }
    } else {
      // No actual video link discovered — remove overlay button to avoid "tiny player" confusion
      const btn = mount.querySelector('.oko-video-poster');
      if (btn) btn.remove();
    }
  }

  // Clean first paragraph indent
  const firstP = mount.querySelector('.post-content p');
  if (firstP){
    firstP.innerHTML = firstP.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i,'').trimStart();
    firstP.style.textIndent='0';
  }
}
