// PostDetail.js — v2025-10-28i
// Instant detail: render from hint immediately, then hydrate with full content.
// Keeps: single "Back to Posts" button (bottom), clean media, tags display.

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPost, getFeaturedImage, getImageCandidates, getPostHint } from './api.js?v=2025-10-28f';

function byline(post) {
  const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date = formatDate(post.date);
  return `${author} • ${date}`;
}

function heroImage(post, priority = 'high') {
  const img = getImageCandidates(post);
  if (!img.src) return null;
  return el('img', {
    src: img.src,
    srcset: img.srcset || undefined,
    sizes: img.sizes || undefined,
    width: img.width || undefined,
    height: img.height || undefined,
    alt: decodeHTML(post.title?.rendered || 'Featured image'),
    loading: 'eager',
    decoding: 'async',
    fetchpriority: priority
  });
}

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
  // Paint above-the-fold instantly from the hint
  const title = decodeHTML(hint?.title?.rendered || 'Untitled');
  const article = el('article', { class: 'post container' },
    el('div', { class: 'post-hero' }, heroImage(hint) || el('div', { class: 'media-fallback' }, '')),
    el('h1', { class: 'post-title' }, title),
    el('div', { class: 'meta' }, byline(hint)),
  );
  mount.innerHTML = '';
  mount.appendChild(article);
  // keep space for future content
  const body = el('div', { class: 'post-body' });
  article.appendChild(body);
  return { article, body };
}

function renderFull({ article, body }, fullPost) {
  const html = fullPost?.content?.rendered || '';
  body.innerHTML = `<div class="post-content">${html}</div>`;

  // add tags after article (if present)
  const tags = (fullPost.tags || []);
  if (Array.isArray(tags) && tags.length) {
    const tagWrap = el('div', { class: 'post-tags container' },
      el('h4', { class: 'tag-title' }, 'Tags'),
      el('ul', { class: 'tag-list' }, ...tags.map(id => el('li', {}, `#${id}`))) // numeric IDs; WP tag names require extra fetch
    );
    article.appendChild(tagWrap);
  }

  // Single "Back to Posts" at bottom only
  const back = el('p', { class: 'container' },
    el('a', { class: 'btn btn-primary', href: '#/' }, 'Back to Posts')
  );
  article.appendChild(back);

  // Lazy up heavy embeds inside post-content (YouTube, iframe)
  for (const iframe of body.querySelectorAll('iframe')) {
    iframe.setAttribute('loading', 'lazy');
  }
}

export async function renderPost(mount, id) {
  renderSkeleton(mount);

  // 1) Try hint for instant paint
  const hint = getPostHint(id);
  let dom = null;
  if (hint) {
    dom = applyHint(mount, hint);
  }

  // 2) Fetch full post in background and hydrate
  try {
    const post = await getPost(id);
    if (!dom) {
      // no hint available; build header now
      const title = decodeHTML(post?.title?.rendered || 'Untitled');
      const article = el('article', { class: 'post container' },
        el('div', { class: 'post-hero' }, heroImage(post) || el('div', { class: 'media-fallback' }, '')),
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
