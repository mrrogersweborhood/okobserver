/* OkObserver — Post Detail (v263)
   Goal: keep full-width media; clicking the poster swaps to a FULL-SIZE player.
   Assumes helpers from utils/common are available: apiJSON, prettyDate, decode,
   featuredSrc, extractVideoURL, normalizePlayer, playerHTML, posterHTML,
   stripEmptyBlocks.
*/

// ✅ Fallback: define API_BASE if user opens a post detail directly
if (!window.API_BASE) {
  window.API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  console.warn("[Detail] API_BASE auto-set for direct page load");
}

export default async function renderDetail(mountOrId, maybeId) {
  // ---- resolve mount + id (supports: renderDetail('#app', 123) or renderDetail(123)) ----
  let mount = document.getElementById('app') || document.body;
  let id = null;

  const looksLikeId = v => (typeof v === 'string' || typeof v === 'number') && /^\d+$/.test(String(v).trim());

  if (mountOrId instanceof Element) {
    mount = mountOrId;
    id = Array.isArray(maybeId) ? maybeId[0] : maybeId;
  } else if (typeof mountOrId === 'string' && (document.getElementById(mountOrId) || /^[.#\[]/.test(mountOrId))) {
    mount = document.querySelector(mountOrId) || mount;
    id = Array.isArray(maybeId) ? maybeId[0] : maybeId;
  } else if (looksLikeId(mountOrId)) {
    id = String(mountOrId);
  }

  if (!window.API_BASE) {
    mount.innerHTML = `<section class="page-error"><p>API base missing.</p></section>`;
    return;
  }
  if (!id) {
    mount.innerHTML = `<section class="page-error"><p>Missing post id.</p></section>`;
    return;
  }

  // ---- fetch post first ----
  let post;
  try {
    post = await apiJSON(`posts/${encodeURIComponent(id)}`, { _embed: 1 });
  } catch (err) {
    console.error('[Detail] fetch failed', err);
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1.25rem auto;padding:1rem">
      <p class="error" style="color:#b00">Failed to load post.</p>
      <p><a href="#/" data-nav="back" class="oko-btn-back">← Back to Posts</a></p>
    </section>`;
    return;
  }

  // ---- derive fields ----
  const rawTitle = post.title?.rendered || '(Untitled)';
  const titleText = decode(rawTitle);
  const author    = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date      = prettyDate(post.date || post.date_gmt);
  const poster    = featuredSrc(post);
  const contentRaw = post.content?.rendered || '';

  // detect any video link in content
  const foundURL  = extractVideoURL(contentRaw);
  const embed     = foundURL ? normalizePlayer(foundURL) : null;

  // ---- media block (poster first; clicking swaps to full-size player) ----
  const mediaHTML = (() => {
    if (poster && embed && embed.type !== 'facebook') {
      return `
        <figure class="post-media media-16x9">
          ${posterHTML(poster, titleText)}
          <button class="oko-play" type="button" aria-label="Play video"></button>
        </figure>`;
    }
    if (embed) {
      return `<figure class="post-media media-16x9">${playerHTML(embed)}</figure>`;
    }
    if (poster) {
      return `<figure class="post-media"><img class="oko-detail-img" src="${poster}" alt=""></figure>`;
    }
    return '';
  })();

  // ---- sanitize/soften content imgs/iframes ----
  let content = stripEmptyBlocks(contentRaw)
    .replaceAll('<iframe', '<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:1rem 0;"')
    .replaceAll('<img', '<img loading="lazy" style="max-width:100%;height:auto;border-radius:10px;margin:1rem 0;"');

  // ---- render the full article atomically ----
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

  // ---- behavior: poster click → swap to FULL-WIDTH iframe ----
  const fig = mount.querySelector('.post-detail .post-media.media-16x9');
  const playBtn = mount.querySelector('.post-detail .oko-play');
  if (fig && playBtn && embed && embed.type !== 'facebook') {
    const swapToPlayer = () => {
      let html = playerHTML(embed)
        .replace(/\swidth="[^"]*"/gi, '')
        .replace(/\sheight="[^"]*"/gi, '');
      fig.innerHTML = html;

      const ifr = fig.querySelector('iframe');
      if (ifr) {
        ifr.removeAttribute('width');
        ifr.removeAttribute('height');
        ifr.style.width = '100%';
        ifr.style.height = '100%';
        ifr.style.display = 'block';
        ifr.style.border = '0';
      }
    };

    playBtn.addEventListener('click', swapToPlayer);
    fig.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        swapToPlayer();
      }
    });
  }

  // ---- back buttons → hash nav ----
  mount.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav="back"]');
    if (b) {
      e.preventDefault();
      window.location.hash = '#/';
    }
  });

  // ---- tidy first paragraph indentation ----
  const firstP = mount.querySelector('.post-content p');
  if (firstP) {
    firstP.innerHTML = firstP.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i, '').trimStart();
    firstP.style.textIndent = '0';
  }
}

/* ---------- tiny helpers for buttons / css hooks ---------- */

function backButtonHTML() {
  return `<a href="#/" data-nav="back" class="oko-btn-back">← Back to Posts</a>`;
}

/* ---------- detail-specific CSS safety net ---------- */
injectOnce('detail-media-sizing', `
  .post-detail .post-media{ margin:0 0 1rem 0; }
  .post-detail .media-16x9{ width:100%; max-width:980px; margin:0 auto 1rem auto;
    aspect-ratio:16/9; position:relative; overflow:hidden; border-radius:12px; }
  .post-detail .media-16x9 > *{ width:100%; height:100%; display:block; }
  .post-detail .oko-detail-img{ width:100%; height:auto; display:block; border-radius:12px; }
  .post-detail .oko-play{
    position:absolute; inset:0; margin:auto; width:68px; height:68px; border:0; border-radius:999px;
    background:rgba(0,0,0,.45); cursor:pointer; display:flex; align-items:center; justify-content:center;
    transition:transform .15s ease, background .15s ease;
  }
  .post-detail .oko-play::before{
    content:""; width:0; height:0; border-left:18px solid #fff; border-top:12px solid transparent; border-bottom:12px solid transparent;
    margin-left:4px;
  }
  .post-detail .oko-play:hover{ transform:scale(1.06); background:rgba(0,0,0,.55); }
  .post-detail .post-header{ padding:0; margin:0 auto 0.5rem auto; max-width:980px; }
  .post-detail .post-title{ margin:.25rem 0 .25rem 0; }
  .post-detail .post-meta{ margin:.25rem 0 1rem 0; color:#556; }
`);

function injectOnce(id, css) {
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}
