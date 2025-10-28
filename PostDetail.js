// PostDetail.js — v2025-10-28k (video hero fixed)
// Instant detail from hint, then hydrate. Proper video handling:
// - If content has an <iframe> (YouTube/Vimeo/etc.), show a click-to-play hero,
//   swap to lazy iframe on click/hydrate.
// - If featured media is video/*, render <video controls> with poster.
// - Otherwise fall back to responsive hero image.

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPost, getImageCandidates, getPostHint } from './api.js?v=2025-10-28g';

function byline(post) {
  const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date = formatDate(post.date);
  return `${author} • ${date}`;
}

/* ---------- Video detection helpers ---------- */
function extractFirstIframeSrcFromHTML(html = '') {
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const iframe = tmp.querySelector('iframe[src]');
    return iframe ? iframe.getAttribute('src') : '';
  } catch {
    return '';
  }
}

function hasSelfHostedVideo(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    const mt = media?.mime_type || '';
    return typeof mt === 'string' && mt.startsWith('video/');
  } catch { return false; }
}

function getSelfHostedVideo(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    const src = media?.source_url || '';
    // Try to find a poster from sizes/full if available
    const sizes = media?.media_details?.sizes || {};
    const poster = (sizes?.medium_large || sizes?.large || sizes?.full)?.source_url || '';
    return { src, poster };
  } catch { return { src: '', poster: '' }; }
}

/* ---------- Hero builders ---------- */
function makeAspectWrapper(child) {
  // 16:9 responsive wrapper; CSS also sets style
  return el('div', { class: 'video-wrapper' }, child);
}

function buildClickToPlayImageHero(post, priority = 'high') {
  const img = getImageCandidates(post);
  if (!img.src) return null;

  const btn = el('button', { class: 'play-overlay', 'aria-label': 'Play video' });
  const imgEl = el('img', {
    src: img.src,
    srcset: img.srcset || undefined,
    sizes: img.sizes || undefined,
    width: img.width || undefined,
    height: img.height || undefined,
    alt: decodeHTML(post.title?.rendered || 'Video placeholder'),
    loading: 'eager',
    decoding: 'async',
    fetchpriority: priority
  });

  const wrap = el('div', { class: 'hero-media is-image' }, imgEl, btn);
  return wrap;
}

function buildIframe(src) {
  return makeAspectWrapper(
    el('iframe', {
      src,
      loading: 'lazy',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowfullscreen: 'true',
      referrerpolicy: 'no-referrer-when-downgrade',
      frameborder: '0'
    })
  );
}

function buildVideoTag({ src, poster }) {
  const video = el('video', {
    controls: true,
    playsinline: true,
    preload: 'metadata',
    poster: poster || undefined
  },
    el('source', { src, type: 'video/mp4' })
  );
  return makeAspectWrapper(video);
}

/* ---------- Tag extraction ---------- */
function extractTagNames(post) {
  try {
    const termGroups = post?._embedded?.['wp:term'];
    if (!Array.isArray(termGroups)) return [];
    const tags = [];
    for (const group of termGroups) {
      for (const term of group || []) {
        if (term.taxonomy === 'post_tag') {
          const name = (term.name || '').trim();
          if (name && !tags.includes(name)) tags.push(name);
        }
      }
    }
    return tags;
  } catch { return []; }
}

function renderTags(article, post) {
  const tagNames = extractTagNames(post);
  if (!tagNames.length) return;

  const tagList = el('ul', { class: 'tag-list' },
    ...tagNames.map(name =>
      el('li', {}, el('span', { class: 'tag-pill' }, `#${decodeHTML(name)}`))
    )
  );

  const wrap = el('div', { class: 'post-tags container' },
    el('h4', { class: 'tag-title' }, 'Tags'),
    tagList
  );

  article.appendChild(wrap);
}

/* ---------- Skeleton / Hint / Hydration ---------- */
function renderSkeleton(mount) {
  mount.innerHTML = `
    <article class="post container">
      <div class="skeleton hero"></div>
      <h1 class="skeleton title"></h1>
      <div class="skeleton byline"></div>
      <div class="skeleton para"></div>
      <div class="skeleton para"></div>
    </article>`;
}

function applyHint(mount, hint) {
  const title = decodeHTML(hint?.title?.rendered || 'Untitled');

  // Try to detect if there will be a video; if yes, render click-to-play placeholder
  const contentHTML = hint?.content?.rendered || hint?.excerpt?.rendered || '';
  const iframeSrc = extractFirstIframeSrcFromHTML(contentHTML);
  let hero = null;

  if (iframeSrc) {
    hero = buildClickToPlayImageHero(hint);
  } else if (hasSelfHostedVideo(hint)) {
    // we can render native video right away with poster if present
    const vid = getSelfHostedVideo(hint);
    hero = (vid.src ? buildVideoTag(vid) : buildClickToPlayImageHero(hint));
  } else {
    // image hero
    const img = getImageCandidates(hint);
    hero = img.src
      ? el('img', {
          src: img.src,
          srcset: img.srcset || undefined,
          sizes: img.sizes || undefined,
          width: img.width || undefined,
          height: img.height || undefined,
          alt: title,
          loading: 'eager',
          decoding: 'async',
          fetchpriority: 'high'
        })
      : el('div', { class: 'media-fallback' }, '');
  }

  const article = el('article', { class: 'post container' },
    el('div', { class: 'post-hero' }, hero),
    el('h1', { class: 'post-title' }, title),
    el('div', { class: 'meta' }, byline(hint)),
  );
  mount.innerHTML = '';
  mount.appendChild(article);
  const body = el('div', { class: 'post-body' });
  article.appendChild(body);

  return { article, body };
}

function renderFull({ article, body }, fullPost) {
  const html = fullPost?.content?.rendered || '';
  body.innerHTML = `<div class="post-content">${html}</div>`;

  // If hero is a click-to-play placeholder, upgrade to real iframe now
  const contentIframeSrc = extractFirstIframeSrcFromHTML(html);
  const heroWrap = article.querySelector('.post-hero');
  if (contentIframeSrc && heroWrap && heroWrap.querySelector('.is-image')) {
    heroWrap.replaceChildren(buildIframe(contentIframeSrc));
  } else if (!contentIframeSrc && hasSelfHostedVideo(fullPost)) {
    // ensure native video is present if self-hosted
    const vid = getSelfHostedVideo(fullPost);
    if (vid.src) heroWrap.replaceChildren(buildVideoTag(vid));
  }

  renderTags(article, fullPost);

  const back = el('p', { class: 'container' },
    el('a', { class: 'btn btn-primary', href: '#/' }, 'Back to Posts')
  );
  article.appendChild(back);

  // Defer heavy embeds upgrade if any remain inside body
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => lazyUpgradeEmbeds(body), { timeout: 2000 });
  } else {
    setTimeout(() => lazyUpgradeEmbeds(body), 1000);
  }
}

function lazyUpgradeEmbeds(scope) {
  for (const iframe of scope.querySelectorAll('iframe')) {
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    iframe.setAttribute('allowfullscreen', 'true');
  }
}

export async function renderPost(mount, id) {
  renderSkeleton(mount);

  const hint = getPostHint(id);
  let dom = null;
  if (hint) dom = applyHint(mount, hint);

  try {
    const post = await getPost(id);
    if (!dom) {
      // Build header if no hint existed
      const title = decodeHTML(post?.title?.rendered || 'Untitled');
      const contentHTML = post?.content?.rendered || '';
      const iframeSrc = extractFirstIframeSrcFromHTML(contentHTML);

      let hero = null;
      if (iframeSrc) {
        hero = buildIframe(iframeSrc);
      } else if (hasSelfHostedVideo(post)) {
        hero = buildVideoTag(getSelfHostedVideo(post));
      } else {
        const img = getImageCandidates(post);
        hero = img.src ? el('img', {
          src: img.src,
          srcset: img.srcset || undefined,
          sizes: img.sizes || undefined,
          width: img.width || undefined,
          height: img.height || undefined,
          alt: title,
          loading: 'eager',
          decoding: 'async',
          fetchpriority: 'high'
        }) : el('div', { class: 'media-fallback' }, '');
      }

      const article = el('article', { class: 'post container' },
        el('div', { class: 'post-hero' }, hero),
        el('h1', { class: 'post-title' }, title),
        el('div', { class: 'meta' }, byline(post)),
      );
      mount.innerHTML = '';
      mount.appendChild(article);
      dom = { article, body: el('div', { class: 'post-body' }) };
      article.appendChild(dom.body);
    }

    renderFull(dom, post);
  } catch (e) {
    console.warn('[OkObserver] renderPost failed:', e);
    mount.innerHTML = `
      <div class="container error">
        <p>Failed to load this article.</p>
        <p style="opacity:.8">${(e && e.message) ? e.message : e}</p>
        <p><a class="btn btn-primary" href="#/">Back to Posts</a></p>
      </div>`;
  }
}
