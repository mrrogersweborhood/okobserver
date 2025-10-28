// PostDetail.js — v2025-10-28j
// Instant detail: render from hint immediately, then hydrate with full content.
// Now with properly formatted tag names (no more numeric IDs).

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
  const title = decodeHTML(hint?.title?.rendered || 'Untitled');
  const article = el('article', { class: 'post container' },
    el('div', { class: 'post-hero' }, heroImage(hint) || el('div', { class: 'media-fallback' }, '')),
    el('h1', { class: 'post-title' }, title),
    el('div', { class: 'meta' }, byline(hint)),
  );
  mount.innerHTML = '';
  mount.appendChild(article);
  const body = el('div', { class: 'post-body' });
  article.appendChild(body);
  return { article, body };
}

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
  } catch {
    return [];
  }
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

function renderFull({ article, body }, fullPost) {
  const html = fullPost?.content?.rendered || '';
  body.innerHTML = `<div class="post-content">${html}</div>`;

  renderTags(article, fullPost);

  const back = el('p', { class: 'container' },
    el('a', { class: 'btn btn-primary', href: '#/' }, 'Back to Posts')
  );
  article.appendChild(back);

  for (const iframe of body.querySelectorAll('iframe')) {
    iframe.setAttribute('loading', 'lazy');
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
