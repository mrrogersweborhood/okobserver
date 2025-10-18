/* detail.v263.js — self-contained detail view (poster + play, no autoplay) */
// Local helpers (no external deps)

function decode(html) {
  const el = document.createElement('textarea');
  el.innerHTML = html || '';
  return el.value;
}

function prettyDate(input) {
  try {
    const d = new Date(input);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return ''; }
}

function featuredSrc(post) {
  const media = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
  const src = media && (media.media_details?.sizes?.large?.source_url || media.source_url);
  return src || '';
}

function extractVideoURL(html) {
  if (!html) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  // Prefer first iframe
  const ifr = tmp.querySelector('iframe[src]');
  if (ifr) return ifr.getAttribute('src');

  // Fallback to anchor with known providers
  const a = tmp.querySelector(
    'a[href*="youtube.com"],a[href*="youtu.be"],a[href*="vimeo.com"],a[href*="facebook.com"]'
  );
  return a ? a.getAttribute('href') : null;
}

function normalizePlayer(url) {
  if (!url) return null;
  try {
    const u = new URL(url, location.href);

    // YouTube
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      let id = '';
      if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
      else id = u.searchParams.get('v') || '';
      if (!id) return null;
      return { type: 'youtube', src: `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` };
    }

    // Vimeo
    if (u.hostname.includes('vimeo.com')) {
      const m = u.pathname.match(/\/(\d+)/);
      if (!m) return null;
      return { type: 'vimeo', src: `https://player.vimeo.com/video/${m[1]}` };
    }

    // Facebook
    if (u.hostname.includes('facebook.com')) {
      const enc = encodeURIComponent(url);
      return { type: 'facebook', src: `https://www.facebook.com/plugins/video.php?href=${enc}&show_text=false` };
    }
  } catch { /* ignore */ }
  return null;
}

function playerHTML(embed) {
  return `
    <div class="oko-player-wrap" style="position:relative;width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;">
      <iframe
        src="${embed.src}"
        allow="accelerometer; encrypted-media; picture-in-picture; web-share"
        allowfullscreen
        referrerpolicy="no-referrer-when-downgrade"
        style="position:absolute;inset:0;border:0;width:100%;height:100%;"></iframe>
    </div>`;
}

function posterHTML(src, alt) {
  return `
    <figure class="post-media" style="margin:0 0 1rem 0">
      <div class="oko-poster" role="button" tabindex="0" aria-label="Play video"
        style="position:relative;display:block;width:100%;cursor:pointer;outline:none;">
        <img alt="${alt}" src="${src}"
          style="display:block;width:100%;height:auto;border-radius:10px;" />
        <span class="oko-play"
          style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
                 width:72px;height:72px;border-radius:50%;
                 background:rgba(0,0,0,.55);display:grid;place-items:center;z-index:2;">
          <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="11" fill="rgba(255,255,255,.15)"></circle>
            <path d="M9 7l8 5-8 5V7z" fill="#fff"></path>
          </svg>
        </span>
      </div>
    </figure>`;
}

function backButtonHTML() {
  return `<a class="oko-btn-back" href="#/" data-nav="back"
            style="display:inline-block;padding:.5rem .8rem;border-radius:999px;background:#e9efff;border:1px solid #c7d7ff;color:#1e3a8a;text-decoration:none;">
            ← Back to Posts</a>`;
}

function stripEmptyBlocks(html) {
  if (!html) return '';
  return String(html)
    .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '');
}

export default async function renderDetail(a, b) {
  // Resolve mount + id
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

  if (!window.API_BASE || typeof window.apiJSON !== 'function') {
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1rem auto;padding:1rem">
      <p class="error" style="color:#b00">API base missing.</p>
      <p>${backButtonHTML()}</p></section>`;
    return;
  }

  // Fetch first
  let post;
  try {
    post = await window.apiJSON(`posts/${encodeURIComponent(id)}`, { _embed: 1 });
  } catch (err) {
    console.error('[Detail] fetch failed', err);
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1rem auto;padding:1rem">
      <p class="error" style="color:#b00">Failed to load post.</p>
      <p>${backButtonHTML()}</p></section>`;
    return;
  }

  const rawTitle = post.title?.rendered || '(Untitled)';
  const title = decode(rawTitle);
  const author = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const dateTxt = prettyDate(post.date || post.date_gmt);
  const poster = featuredSrc(post);
  const contentRaw = post.content?.rendered || '';
  const initialURL = extractVideoURL(contentRaw);
  const initialEmbed = initialURL ? normalizePlayer(initialURL) : null;

  // Media
  let mediaHTML = '';
  if (poster) {
    mediaHTML = posterHTML(poster, title);
  } else if (initialEmbed) {
    mediaHTML = `<figure class="post-media">${playerHTML(initialEmbed)}</figure>`;
  }

  // Content cleanup
  let content = stripEmptyBlocks(contentRaw)
    .replaceAll('<iframe', '<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:1rem 0;"')
    .replaceAll('<img', '<img loading="lazy" style="max-width:100%;height:auto;border-radius:10px;margin:1rem 0;"');

  // Paint
  mount.innerHTML = `
    <article class="post-detail" style="max-width:980px;margin:0 auto 56px;">
      <div class="oko-actions-top" style="margin:0 0 1rem 0;">${backButtonHTML()}</div>
      ${mediaHTML}
      <header class="post-header" style="background:transparent;">
        <h1 class="post-title" style="margin:.25rem 0 0 0;">${rawTitle}</h1>
        <div class="post-meta" style="color:#4b5563;margin:.35rem 0 1rem 0;">By ${author} — ${dateTxt}</div>
      </header>
      <div class="post-content" style="text-indent:0">${content}</div>
      <div class="oko-actions-bottom" style="margin-top:1.1rem">${backButtonHTML()}</div>
    </article>
  `;

  // Click-to-play: compute embed at click-time if needed
  const posterEl = mount.querySelector('.oko-poster');
  if (posterEl) {
    const swap = () => {
      // Use precomputed embed if present, otherwise derive now (some posts hide the URL behind shorteners/params)
      let embed = initialEmbed;
      if (!embed) {
        const lateURL = extractVideoURL(contentRaw);
        embed = lateURL ? normalizePlayer(lateURL) : null;
      }
      if (!embed) {
        console.warn('[Detail] No playable video URL found on click.');
        return;
      }
      const fig = posterEl.closest('.post-media');
      if (fig) fig.innerHTML = playerHTML(embed);
    };
    posterEl.addEventListener('click', swap);
    posterEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); swap(); }
    });
  }

  // Back to posts
  mount.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav="back"]');
    if (b) { e.preventDefault(); window.location.hash = '#/'; }
  });

  // Tidy first paragraph
  const firstP = mount.querySelector('.post-content p');
  if (firstP) {
    firstP.innerHTML = firstP.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i, '').trimStart();
  }

  console.log('[Detail] rendered', { id, title });
}
