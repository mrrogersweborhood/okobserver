export default async function renderDetail(a, b){
  // Resolve mount + id (same as before)
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

  if(!API_BASE){ mount.innerHTML = `<section class="page-error"><p>Page error: API base missing.</p></section>`; return; }
  if(!id){ mount.innerHTML = `<section class="page-error"><p>Page error: missing id.</p></section>`; return; }

  // 1) Fetch FIRST — no UI yet
  let post;
  try {
    post = await apiJSON(`posts/${encodeURIComponent(id)}`, {_embed:1});
  } catch (err) {
    console.error('[Detail] fetch failed', err);
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1.25rem auto;padding:1rem">
      <p class="error" style="color:#b00">Failed to load post.</p>
      <p><a class="oko-btn-back" href="#/">← Back to Posts</a></p>
    </section>`;
    return;
  }

  // 2) Build the ready-to-display markup
  const rawTitle = post.title?.rendered || '(Untitled)';
  const author   = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date     = prettyDate(post.date || post.date_gmt);
  const poster   = featuredSrc(post);
  const contentRaw = post.content?.rendered || '';
  const url      = extractVideoURL(contentRaw);
  const embed    = url ? normalizePlayer(url) : null;

  const mediaHTML = (() => {
    if (poster && embed && embed.type !== 'facebook') {
      // poster with click-to-play
      const titleText = decode(rawTitle);
      return `
        <figure class="post-media" style="margin:0 0 1rem 0">
          ${posterHTML(poster, titleText)}
        </figure>`;
    }
    if (embed) return `<figure class="post-media">${playerHTML(embed)}</figure>`;
    if (poster) return `<figure class="post-media"><img src="${poster}" alt="" class="oko-detail-img"></figure>`;
    return '';
  })();

  let content = stripEmptyBlocks(contentRaw)
    .replaceAll('<iframe','<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:1rem 0;"')
    .replaceAll('<img','<img loading="lazy" style="max-width:100%;height:auto;border-radius:10px;margin:1rem 0;"');

  // 3) Now write the FULL article at once (title + byline underneath)
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

  // Activate the poster click only now (if present)
  const posterEl = mount.querySelector('.oko-video-poster');
  if (posterEl && embed && embed.type !== 'facebook') {
    const swap = () => {
      const fig = posterEl.closest('.post-media');
      if (fig) fig.innerHTML = playerHTML(embed);
    };
    posterEl.addEventListener('click', swap);
    posterEl.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); swap(); }});
  }

  // Back buttons → hash nav
  mount.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav="back"]');
    if (b) { e.preventDefault(); window.location.hash = '#/'; }
  });

  // Tidy first paragraph
  const firstP = mount.querySelector('.post-content p');
  if (firstP){
    firstP.innerHTML = firstP.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i,'').trimStart();
    firstP.style.textIndent='0';
  }
}
