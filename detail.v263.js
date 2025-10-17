/* OkObserver – Detail view (v2.6.3)
   Exports ONE default function the router can call.
   Keeps logs; avoids blue header; author/date under title; large player.
*/

/* ---------- tiny helpers ---------- */
const log = (...a) => console.log('[Detail]', ...a);

const decode = (s = '') => {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
};

const prettyDate = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
};

const select = (sel, root = document) => root.querySelector(sel);

/* API helper: uses global apiJSON if present; otherwise fetch */
async function apiGet(path) {
  if (typeof apiJSON === 'function') return apiJSON(path, { _embed: 1 });

  // Fallback: infer API_BASE from home view or main boot
  let base = (typeof API_BASE === 'string' && API_BASE) || window.__OKO_API_BASE__;
  if (!base) {
    // Try to find it in the console boot prints (main.js sets this)
    base = (window.__OKO_API_BASE__ = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2');
    log('API_BASE auto-set for direct page load');
  }

  const url = `${base.replace(/\/+$/,'')}/${path.replace(/^\/+/,'')}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
  return r.json();
}

/* media helpers */
const featuredSrc = (post) => {
  const m = post._embedded?.['wp:featuredmedia']?.[0];
  return m?.source_url || '';
};

const extractVideoURL = (html = '') => {
  // naive scan for vimeo/youtube
  const vimeo = html.match(/https?:\/\/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return { type: 'vimeo', id: vimeo[1], url: vimeo[0] };
  const ytb = html.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
  if (ytb) return { type: 'youtube', id: ytb[1], url: ytb[0] };
  return null;
};

const playerHTML = (embed) => {
  if (!embed) return '';
  if (embed.type === 'vimeo') {
    return `<div class="oko-player-wrap"><iframe loading="lazy" src="https://player.vimeo.com/video/${embed.id}?title=0&byline=0&portrait=0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  if (embed.type === 'youtube') {
    return `<div class="oko-player-wrap"><iframe loading="lazy" src="https://www.youtube.com/embed/${embed.id}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
  }
  return '';
};

const posterHTML = (src, alt = '') =>
  `<button type="button" class="oko-video-poster" aria-label="Play video">
     <img src="${src}" alt="${alt}">
     <span class="oko-video-play"></span>
   </button>`;

/* sanitize/normalize article content blocks */
const stripEmptyBlocks = (html = '') =>
  html.replace(/<p>\s*(?:&nbsp;|\s|<br\s*\/?>)*<\/p>/gi, '').trim();

/* back button component */
const backButtonHTML = () =>
  `<a href="#/" class="oko-btn-back" data-nav="back">← Back to Posts</a>`;

/* ---------- main exported function ---------- */
export default async function renderDetail(mountOrId, idMaybe) {
  // Resolve mount + id
  let mountEl, postId;
  const isNode = (x) => x && typeof x === 'object' && x.nodeType === 1;

  if (isNode(mountOrId)) {
    mountEl = mountOrId;
    postId = idMaybe;
  } else if (typeof mountOrId === 'string' && document.getElementById(mountOrId)) {
    mountEl = document.getElementById(mountOrId);
    postId = idMaybe;
  } else {
    mountEl = document.getElementById('app') || document.body;
    postId = mountOrId;
  }

  // Loading shell
  mountEl.innerHTML = `
    <section class="ok-card" style="max-width:980px;margin:1rem auto;padding:12px 16px">
      <p>Loading…</p>
    </section>
  `;

  try {
    const post = await apiGet(`posts/${encodeURIComponent(postId)}?_embed=1`);
    const rawTitle = post.title?.rendered || '(Untitled)';
    const titleText = decode(rawTitle);
    const author = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
    const date = prettyDate(post.date || post.date_gmt);
    const poster = featuredSrc(post);
    const contentRaw = post.content?.rendered || '';
    const embed = extractVideoURL(contentRaw);

    // Media: prefer poster with click-to-play for Vimeo/YouTube
    let mediaHTML = '';
    if (embed && poster) {
      mediaHTML = `<figure class="post-media">${posterHTML(poster, titleText)}</figure>`;
    } else if (embed && !poster) {
      mediaHTML = `<figure class="post-media">${playerHTML(embed)}</figure>`;
    } else if (poster) {
      mediaHTML = `<figure class="post-media"><img src="${poster}" alt="${titleText}" class="oko-detail-img"></figure>`;
    }

    // Normalize content media blocks
    let content = stripEmptyBlocks(contentRaw)
      .replaceAll('<iframe', '<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px;margin:1rem 0;"')
      .replaceAll('<img', '<img loading="lazy" style="max-width:100%;height:auto;border-radius:12px;margin:1rem 0;"');

    // Full article (no blue bar; byline under title; centered title)
    mountEl.innerHTML = `
      <article class="post-detail">
        <div class="oko-actions-top">${backButtonHTML()}</div>
        ${mediaHTML}
        <header class="post-header">
          <h1 class="post-title">${titleText}</h1>
          <div class="post-meta">By ${author} — ${date}</div>
        </header>
        <div class="post-content">${content}</div>
        <div class="oko-actions-bottom" style="margin-top:1.1rem">${backButtonHTML()}</div>
      </article>
    `;

    // Activate poster → swap to LARGE inline player
    const posterBtn = select('.oko-video-poster', mountEl);
    if (posterBtn && embed) {
      const onPlay = () => {
        const fig = posterBtn.closest('.post-media');
        if (fig) fig.innerHTML = playerHTML(embed);
      };
      posterBtn.addEventListener('click', onPlay);
      posterBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(); }
      });
    }

    // Back links navigate via hash
    mountEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-nav="back"]');
      if (b) { e.preventDefault(); window.location.hash = '#/'; }
    });

    // Tidy first paragraph indent
    const firstP = select('.post-content p', mountEl);
    if (firstP) {
      firstP.innerHTML = firstP.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i, '').trimStart();
      firstP.style.textIndent = '0';
    }

    log('rendered', { id: postId, title: titleText });
  } catch (err) {
    console.error('[Detail] fetch failed', err);
    mountEl.innerHTML = `
      <section class="ok-card" style="max-width:980px;margin:1rem auto;padding:12px 16px">
        <p class="error" style="color:#b00">Failed to load post.</p>
        <p><a class="oko-btn-back" href="#/">← Back to Posts</a></p>
      </section>
    `;
  }
}

/* ---------- view-specific CSS (scoped via cascade) ----------
   These rules rely on your existing override.css, but adding
   minimal guards here ensures no blue title + correct spacing
*/
const injectOnce = (() => {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const css = `
      article.post-detail{max-width:980px;margin:0 auto;padding:8px 12px; background:transparent; border:0; box-shadow:none;}
      article.post-detail .post-header{margin:0.75rem 0 0.5rem;}
      article.post-detail .post-title{margin:0; padding:0; background:transparent !important; color:var(--text-dark,#111); text-align:left;}
      article.post-detail .post-meta{margin-top:6px; color:#666; font-size:.95rem;}
      .oko-player-wrap{width:100%; max-width:100%; aspect-ratio:16/9; border-radius:12px; overflow:hidden; box-shadow:0 6px 22px rgba(0,0,0,.08);}
      .oko-player-wrap iframe{width:100%; height:100%; display:block; border:0;}
      .oko-video-poster{position:relative; display:block; width:100%; border:0; padding:0; background:transparent; cursor:pointer;}
      .oko-video-poster img{display:block; width:100%; height:auto; border-radius:12px; box-shadow:0 6px 22px rgba(0,0,0,.08);}
      .oko-video-play{position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
        width:64px; height:64px; border-radius:50%; background:rgba(0,0,0,.45);
        display:inline-flex; align-items:center; justify-content:center;}
      .oko-video-play::before{content:''; display:block; margin-left:3px; width:0; height:0;
        border-left:16px solid #fff; border-top:10px solid transparent; border-bottom:10px solid transparent;}
      .oko-btn-back{display:inline-block; padding:8px 12px; border-radius:999px; background:#e9f2ff; color:#0f3d8a; text-decoration:none;}
      @media (max-width:640px){
        article.post-detail{padding:8px;}
        .oko-video-play{width:52px; height:52px;}
        .oko-video-play::before{border-left-width:14px; border-top-width:9px; border-bottom-width:9px;}
      }
    `;
    const s = document.createElement('style');
    s.setAttribute('data-oko-detail-css','1');
    s.textContent = css;
    document.head.appendChild(s);
  };
})();

injectOnce();
