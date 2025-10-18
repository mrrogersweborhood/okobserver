/* detail.v263.js — post detail view (safe, self-contained; resilient import)
   - Robust poster → click-to-play
   - Vimeo / YouTube / Facebook inline embed (responsive 16:9)
   - Byline under title
   - Leaves global styles/headers/home grid untouched
*/

import * as U from './utils.v263.js';

// ---- resolve helpers from utils or global (no hard named imports) ----
const apiJSON =
  U.apiJSON || U.apiJson || U.api || (typeof window !== 'undefined' ? window.apiJSON : null);

const decode = U.decode || ((x) => x);
const prettyDate = U.prettyDate || ((s) => s);
const featuredSrc = U.featuredSrc || (() => null);

/* ---------- tiny helpers ---------- */

function sel(m, q) { return (m || document).querySelector(q); }
function html(strings, ...vals) {
  return strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ''), '');
}

// Pull the *first* media-ish URL from content
function firstMediaURL(raw = '') {
  const a = document.createElement('div');
  a.innerHTML = raw;
  const link = a.querySelector('a[href]');
  if (link) return link.getAttribute('href');

  // fallback: scan text
  const txt = a.textContent || '';
  const m = txt.match(/https?:\/\/\S+/);
  return m ? m[0].replace(/[),.]+$/, '') : null;
}

// Normalize to a playable embed URL
function normalizePlayer(url) {
  if (!url) return null;
  try {
    const u = new URL(url);

    // Vimeo
    if (/vimeo\.com$/i.test(u.hostname) || /player\.vimeo\.com$/i.test(u.hostname)) {
      let id = null;
      const parts = u.pathname.replace(/^\/+/, '').split('/');
      for (let i = parts.length - 1; i >= 0; i--) {
        if (/^\d+$/.test(parts[i])) { id = parts[i]; break; }
      }
      if (id) {
        return { type: 'vimeo', src: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1` };
      }
    }

    // YouTube (youtu.be / youtube.com)
    if (/youtu\.be$/i.test(u.hostname)) {
      const id = u.pathname.slice(1);
      if (id) return { type: 'youtube', src: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` };
    }
    if (/youtube\.com$/i.test(u.hostname)) {
      if (u.pathname.startsWith('/embed/')) {
        return { type: 'youtube', src: u.toString() };
      }
      const id = u.searchParams.get('v');
      if (id) return { type: 'youtube', src: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` };
    }

    // Facebook
    if (/facebook\.com$/i.test(u.hostname)) {
      const encoded = encodeURIComponent(url);
      return {
        type: 'facebook',
        src: `https://www.facebook.com/plugins/video.php?href=${encoded}&show_text=false&autoplay=true`,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function playerHTML(embed) {
  if (!embed?.src) return '';
  return `
    <div class="oko-embed-wrap" style="
      position:relative;width:100%;max-width:980px;margin:0 auto 1rem auto;">
      <div style="position:relative;width:100%;aspect-ratio:16/9;">
        <iframe
          src="${embed.src}"
          title="Embedded media"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowfullscreen
          loading="lazy"
          style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:10px;">
        </iframe>
      </div>
    </div>
  `;
}

function posterHTML(src, titleText) {
  const safeAlt = titleText ? ` alt="${titleText.replace(/"/g, '&quot;')}"` : ' alt=""';
  return `
    <figure class="post-media" style="margin:0 0 1rem 0;max-width:980px;margin-inline:auto;">
      <div class="oko-poster-wrap" style="position:relative;">
        <img class="oko-video-poster" src="${src}"${safeAlt}
             style="display:block;width:100%;height:auto;border-radius:10px;">
        <button type="button"
                class="oko-play"
                aria-label="Play video"
                style="
                  position:absolute;inset:0;margin:auto;width:84px;height:84px;
                  border-radius:50%;border:0;cursor:pointer;
                  background:rgba(0,0,0,.35);
                  display:flex;align-items:center;justify-content:center;">
          <svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="rgba(255,255,255,.9)"/>
            <polygon points="26,20 46,32 26,44" fill="#111"/>
          </svg>
        </button>
      </div>
    </figure>
  `;
}

function backButtonHTML() {
  return `<a class="oko-btn-back" data-nav="back" href="#/"
            style="display:inline-block;padding:.55rem .9rem;border-radius:10px;
                   background:#e9eefc;border:1px solid rgba(0,0,0,.08);
                   text-decoration:none;font-weight:600;">← Back to Posts</a>`;
}

function tidyFirstParagraph(mount) {
  const p = sel(mount, '.post-content p');
  if (p) {
    p.innerHTML = p.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i, '').trimStart();
    p.style.textIndent = '0';
  }
}

/* ---------- main render ---------- */

export default async function renderDetail(a, b) {
  // Resolve mount + id (compatible with your router)
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

  // Guard API
  if (typeof apiJSON !== 'function') {
    console.error('[Detail] apiJSON unavailable in utils/global');
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1.25rem auto;padding:1rem">
      <p class="error" style="color:#b00">Failed to load post.</p>
      <p>${backButtonHTML()}</p>
    </section>`;
    return;
  }

  // Fetch first (no UI flicker)
  let post;
  try {
    post = await apiJSON(`posts/${encodeURIComponent(id)}`, { _embed: 1 });
  } catch (err) {
    console.error('[Detail] fetch failed', err);
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1.25rem auto;padding:1rem">
      <p class="error" style="color:#b00">Failed to load post.</p>
      <p>${backButtonHTML()}</p>
    </section>`;
    return;
  }

  // Post bits
  const rawTitle   = post.title?.rendered || '(Untitled)';
  const titleText  = decode(rawTitle);
  const author     = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date       = prettyDate(post.date || post.date_gmt);
  const poster     = featuredSrc(post);
  const contentRaw = post.content?.rendered || '';

  // Try to find a playable URL in content
  const mediaURL = firstMediaURL(contentRaw);
  const embed    = normalizePlayer(mediaURL);

  // Build media area
  let mediaHTML = '';
  if (poster && embed?.src) {
    mediaHTML = posterHTML(poster, titleText);
  } else if (embed?.src) {
    mediaHTML = playerHTML(embed);
  } else if (poster) {
    mediaHTML = posterHTML(poster, titleText);
  }

  // Render full article
  const content = contentRaw
    .replaceAll('<iframe', '<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:1rem 0;"')
    .replaceAll('<img',    '<img loading="lazy" style="max-width:100%;height:auto;border-radius:10px;margin:1rem 0;"');

  mount.innerHTML = html`
    <article class="post-detail" style="max-width:980px;margin:0 auto 1.25rem auto;padding:0 12px;">
      <div class="oko-actions-top" style="margin:1rem 0 1rem 0">${backButtonHTML()}</div>

      ${mediaHTML}

      <header class="post-header" style="margin:0 0 .5rem 0">
        <h1 class="post-title" style="margin:.3rem 0 .35rem 0">${rawTitle}</h1>
        <div class="post-meta" style="opacity:.8">By ${author} — ${date}</div>
      </header>

      <div class="post-content">${content}</div>

      <div class="oko-actions-bottom" style="margin-top:1.1rem">${backButtonHTML()}</div>
    </article>
  `;

  // Wire up poster → player swap (only if we *have* a valid embed)
  if (embed?.src) {
    const posterEl = sel(mount, '.oko-video-poster');
    const playBtn  = sel(mount, '.oko-play');
    const wrapper  = posterEl ? posterEl.closest('.post-media') : null;

    const swap = () => {
      if (!wrapper) return;
      wrapper.outerHTML = playerHTML(embed);
    };
    if (posterEl && playBtn) {
      playBtn.addEventListener('click', swap);
      playBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); swap(); }
      });
    }
  }

  // Hash nav for back buttons
  mount.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav="back"]');
    if (b) { e.preventDefault(); window.location.hash = '#/'; }
  });

  tidyFirstParagraph(mount);
}
