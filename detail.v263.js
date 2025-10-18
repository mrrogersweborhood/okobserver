/* detail.v263.js — inline video (FB/Vimeo/YouTube), play overlay, no blue title, byline under title */
/* Keeps console logs; no hardcoded IDs; avoids tiny iframe and phantom whitespace */
import { decode, prettyDate, featuredSrc, stripEmptyBlocks } from './utils.v263.js';
import { normalizePlayer, playerHTML, extractVideoURL } from './shared.js';

export default async function renderDetail(a, b){
  console.log('[Detail] renderDetail start', { a, b });

  // Resolve mount + id (flexible signature)
  let mount, id;
  const looksLikeId = x => (typeof x === 'string' || typeof x === 'number') && /^\d+$/.test(String(x).trim());
  if (a instanceof Element || (typeof a === 'string' && (document.getElementById(a) || /^[.#\[]/.test(a)))){
    mount = a instanceof Element ? a : document.querySelector(a);
    id = Array.isArray(b) ? b[0] : b;
  } else {
    mount = document.getElementById('app') || document.body;
    id = Array.isArray(a) ? a[0] : a;
  }
  if (!id && looksLikeId(a)) id = a;
  if (!mount) { console.error('[Detail] No mount'); return; }

  // API base guard (works on direct-load of #/post/:id)
  if (!window.API_BASE) {
    console.warn('[Detail] API_BASE missing at detail entry — ensure main.js sets it before route, or define globally.');
  }
  if (!window.API_BASE){
    mount.innerHTML = `
      <section class="ok-card" style="max-width:920px;margin:1.25rem auto;padding:1rem">
        <p class="error" style="color:#b00">API base missing.</p>
        <p><a class="oko-btn-back" href="#/">← Back to Posts</a></p>
      </section>`;
    return;
  }

  // Fetch post first
  let post;
  try {
    post = await apiJSON(`posts/${encodeURIComponent(id)}`, { _embed: 1 });
    console.log('[Detail] fetched', { id, title: post?.title?.rendered });
  } catch (err) {
    console.error('[Detail] fetch failed', err);
    mount.innerHTML = `
      <section class="ok-card" style="max-width:920px;margin:1.25rem auto;padding:1rem">
        <p class="error" style="color:#b00">Failed to load post.</p>
        <p><a class="oko-btn-back" href="#/">← Back to Posts</a></p>
      </section>`;
    return;
  }

  // Derive fields
  const rawTitle = post.title?.rendered || '(Untitled)';
  const titleText = decode(rawTitle);
  const author   = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date     = prettyDate(post.date || post.date_gmt);
  const poster   = featuredSrc(post);
  const contentRaw = post.content?.rendered || '';

  // Detect a video link (fb/yt/vimeo) from body
  const linkInBody = extractVideoURL(contentRaw);
  const embed      = linkInBody ? normalizePlayer(linkInBody) : null;

  // Build media block
  const mediaHTML = (() => {
    if (embed) {
      if (embed.type === 'facebook') {
        // FB: embed a real iframe inline (no SDK), full width
        const fbSrc = embed.src;
        return `
          <figure class="post-media">
            <div class="oko-embed">
              <iframe src="${fbSrc}"
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowfullscreen loading="lazy"></iframe>
            </div>
          </figure>`;
      }
      // Vimeo/YouTube:
      if (poster) {
        // poster with overlay; click swaps to iframe player
        return `
          <figure class="post-media">
            <a class="oko-video-poster" href="#" data-embed='${encodeURIComponent(JSON.stringify(embed))}'>
              <img src="${poster}" alt="${titleText}">
              <span class="oko-video-play" aria-hidden="true"></span>
            </a>
          </figure>`;
      }
      // no poster — render player immediately
      return `
        <figure class="post-media">
          <div class="oko-embed">${playerHTML(embed)}</div>
        </figure>`;
    }
    // No detectable embed — just show featured image if any
    if (poster) {
      return `
        <figure class="post-media">
          <img src="${poster}" alt="${titleText}" class="oko-detail-img">
        </figure>`;
    }
    return '';
  })();

  // Clean content (normalize stray media)
  let content = stripEmptyBlocks(contentRaw)
    .replaceAll('<iframe','<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:1rem 0;"')
    .replaceAll('<img','<img loading="lazy" style="max-width:100%;height:auto;border-radius:10px;margin:1rem 0;"');

  // Compose article (no blue title; byline under title)
  mount.innerHTML = `
    <article class="post-detail">
      <div class="oko-actions-top"><a class="oko-btn-back" href="#/" data-nav="back">← Back to Posts</a></div>
      ${mediaHTML}
      <header class="post-header">
        <h1 class="post-title">${rawTitle}</h1>
        <div class="post-meta">By ${author} — ${date}</div>
      </header>
      <div class="post-content">${content}</div>
      <div class="oko-actions-bottom"><a class="oko-btn-back" href="#/" data-nav="back">← Back to Posts</a></div>
    </article>`;

  // Back buttons → hash nav
  mount.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav="back"]');
    if (b) { e.preventDefault(); window.location.hash = '#/'; }
  });

  // Poster click → swap to iframe (Vimeo/YouTube only; FB already inline)
  const posterLink = mount.querySelector('.oko-video-poster');
  if (posterLink) {
    posterLink.addEventListener('click', (e) => {
      e.preventDefault();
      const fig = posterLink.closest('.post-media');
      try {
        const data = JSON.parse(decodeURIComponent(posterLink.getAttribute('data-embed') || '{}'));
        if (!data || !data.src) return;
        fig.innerHTML = `<div class="oko-embed">${playerHTML(data)}</div>`;
      } catch(err) {
        console.error('[Detail] poster swap failed', err);
      }
    }, { passive:false });
  }

  // Tidy first paragraph
  const firstP = mount.querySelector('.post-content p');
  if (firstP) {
    firstP.innerHTML = firstP.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i,'').trimStart();
    firstP.style.textIndent='0';
  }

  console.log('[Detail] renderDetail done');
}
