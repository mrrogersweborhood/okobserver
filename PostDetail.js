// PostDetail.js — v2025-10-28m (defensive video handling, no empty heroes)
// - Robust hero selection with safe fallbacks
// - If embed fails/blocked, shows image poster + "Play on provider" link
// - Preserves instant hint paint + hydration, tag pills, single Back

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPost, getImageCandidates, getPostHint } from './api.js?v=2025-10-28i';

/* ------------ Basics ------------ */
function byline(post) {
  const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date = formatDate(post.date);
  return `${author} • ${date}`;
}

/* ------------ Parse content for embeds ------------ */
function firstIframeSrc(html = '') {
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const iframe = tmp.querySelector('iframe[src]');
    return iframe ? iframe.getAttribute('src') : '';
  } catch { return ''; }
}

/* YouTube helper: derive thumbnail for a given watch/embed URL */
function youTubeThumb(src = '') {
  try {
    const m = src.match(/(?:youtube\.com\/(?:embed|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    const id = m && m[1];
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
  } catch { return ''; }
}

/* Self-hosted video detection */
function selfHostedVideo(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    const mt = media?.mime_type || '';
    if (typeof mt === 'string' && mt.startsWith('video/')) {
      const src = media?.source_url || '';
      const sizes = media?.media_details?.sizes || {};
      const poster = (sizes?.medium_large || sizes?.large || sizes?.full)?.source_url || '';
      return { src, poster };
    }
  } catch {}
  return { src: '', poster: '' };
}

/* ------------ Hero builders (all return a node, never empty wrapper) ------------ */
function buildImageHero(post, { priority = 'high', alt = 'Featured image' } = {}) {
  const img = getImageCandidates(post);
  if (!img.src) return null;
  return el('img', {
    src: img.src,
    srcset: img.srcset || undefined,
    sizes: img.sizes || undefined,
    width: img.width || undefined,
    height: img.height || undefined,
    alt,
    loading: 'eager',
    decoding: 'async',
    fetchpriority: priority
  });
}

function buildClickPoster(src, playHref = '', title = 'Play') {
  const img = el('img', { src, alt: title, loading: 'eager', decoding: 'async' });
  const btn = el('button', { class: 'play-overlay', 'aria-label': 'Play video' });
  const wrap = el('div', { class: 'hero-media is-image' }, img, btn);
  if (playHref) {
    wrap.addEventListener('click', () => window.open(playHref, '_blank', 'noopener'));
  }
  return wrap;
}

function buildIframe(src) {
  const iframe = el('iframe', {
    src,
    loading: 'lazy',
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    allowfullscreen: 'true',
    referrerpolicy: 'no-referrer-when-downgrade',
    frameborder: '0'
  });
  const wrap = el('div', { class: 'video-wrapper' }, iframe);

  // Fail-safe: if the iframe never completes within 4s (e.g., X-Frame-Options),
  // dispatch an event so caller can swap to poster fallback.
  const t = setTimeout(() => wrap.dispatchEvent(new CustomEvent('embed-timeout')), 4000);
  iframe.addEventListener('load', () => clearTimeout(t), { once: true });

  return wrap;
}

function buildVideoTag({ src, poster }) {
  if (!src) return null;
  const video = el('video', {
    controls: true, playsinline: true, preload: 'metadata',
    poster: poster || undefined
  }, el('source', { src, type: 'video/mp4' }));
  return el('div', { class: 'video-wrapper' }, video);
}

/* ------------ Tags ------------ */
function extractTagNames(post) {
  try {
    const groups = post?._embedded?.['wp:term'];
    if (!Array.isArray(groups)) return [];
    const tags = [];
    for (const group of groups) for (const term of group || []) {
      if (term.taxonomy === 'post_tag') {
        const name = (term.name || '').trim();
        if (name && !tags.includes(name)) tags.push(name);
      }
    }
    return tags;
  } catch { return []; }
}

function renderTags(article, post) {
  const names = extractTagNames(post);
  if (!names.length) return;
  const list = el('ul', { class: 'tag-list' },
    ...names.map(n => el('li', {}, el('span', { class: 'tag-pill' }, `#${decodeHTML(n)}`)))
  );
  const wrap = el('div', { class: 'post-tags container' },
    el('h4', { class: 'tag-title' }, 'Tags'),
    list
  );
  article.appendChild(wrap);
}

/* ------------ Skeleton / Hint / Hydration ------------ */
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

function buildHeroFromHintLike(post) {
  const title = decodeHTML(post?.title?.rendered || 'Untitled');
  const html = post?.content?.rendered || post?.excerpt?.rendered || '';
  const embedSrc = firstIframeSrc(html);
  const selfVid = selfHostedVideo(post);

  // Priority order with guardrails
  if (embedSrc) {
    // Show a poster if we can derive one (e.g., YouTube), else image hero, else black-free fallback
    const ytPoster = youTubeThumb(embedSrc);
    if (ytPoster) return buildClickPoster(ytPoster, embedSrc, title);
    const imgHero = buildImageHero(post, { alt: title });
    if (imgHero) return imgHero;
    return null;
  }
  if (selfVid.src) {
    const node = buildVideoTag(selfVid);
    if (node) return node;
  }
  const imgHero = buildImageHero(post, { alt: title });
  return imgHero; // may be null, but never an empty black wrapper
}

function applyHint(mount, hint) {
  const title = decodeHTML(hint?.title?.rendered || 'Untitled');
  const hero = buildHeroFromHintLike(hint);

  const article = el('article', { class: 'post container' },
    el('div', { class: 'post-hero' }, hero || el('div', { class: 'media-fallback' }, '')),
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
  const title = decodeHTML(fullPost?.title?.rendered || 'Untitled');
  const html  = fullPost?.content?.rendered || '';
  body.innerHTML = `<div class="post-content">${html}</div>`;

  // Upgrade hero based on real content (with fallback if blocked)
  const heroWrap = article.querySelector('.post-hero');
  const embedSrc = firstIframeSrc(html);
  const selfVid  = selfHostedVideo(fullPost);

  if (embedSrc) {
    const iframeNode = buildIframe(embedSrc);
    if (iframeNode) {
      heroWrap.replaceChildren(iframeNode);

      // Fallback if provider blocks embedding or never loads
      iframeNode.addEventListener('embed-timeout', () => {
        const poster = youTubeThumb(embedSrc) || getImageCandidates(fullPost).src || '';
        if (poster) heroWrap.replaceChildren(buildClickPoster(poster, embedSrc, title));
        else {
          const imgHero = buildImageHero(fullPost, { alt: title });
          heroWrap.replaceChildren(imgHero || el('div', { class: 'media-fallback' }, ''));
        }
      }, { once: true });
    }
  } else if (selfVid.src) {
    const vidNode = buildVideoTag(selfVid);
    if (vidNode) heroWrap.replaceChildren(vidNode);
    else {
      const imgHero = buildImageHero(fullPost, { alt: title });
      heroWrap.replaceChildren(imgHero || el('div', { class: 'media-fallback' }, ''));
    }
  } else {
    const imgHero = buildImageHero(fullPost, { alt: title });
    if (imgHero) heroWrap.replaceChildren(imgHero);
  }

  renderTags(article, fullPost);

  const back = el('p', { class: 'container' },
    el('a', { class: 'btn btn-primary', href: '#/' }, 'Back to Posts')
  );
  article.appendChild(back);

  // Light embed hygiene
  const iframes = body.querySelectorAll('iframe');
  for (const f of iframes) {
    f.setAttribute('loading', 'lazy');
    f.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    f.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    f.setAttribute('allowfullscreen', 'true');
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
      // In the rare case we had no hint, build a safe header now
      const title = decodeHTML(post?.title?.rendered || 'Untitled');
      const hero  = buildHeroFromHintLike(post);
      const article = el('article', { class: 'post container' },
        el('div', { class: 'post-hero' }, hero || el('div', { class: 'media-fallback' }, '')),
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
