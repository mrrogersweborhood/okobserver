// detail.js — single post view
// v2.5.7
// - Force no-indent on paragraphs even if WP injected inline styles
// - Keep title blue, author/date meta, clickable hero for first video link
// - Only a bottom “Back to posts” button

import { fetchPostById, getFeaturedImage, getAuthorName } from './api.js';
import { createEl, ordinalDate } from './shared.js';

function decodeEntity(str = '') {
  const t = document.createElement('textarea');
  t.innerHTML = str;
  return t.value;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return ordinalDate
      ? ordinalDate(d)
      : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Remove any indentation WP might inject:
 * - text-indent on <p> (inline style)
 * - leading &nbsp; or whitespace at start of <p> innerHTML
 * - margin-left/padding-left that imitates indent
 * Also zero-out text-indent on any styled wrapper that might cause indent.
 */
function normalizeIndentation(root) {
  if (!root) return;

  // 1) Clean paragraphs
  const paras = root.querySelectorAll('p');
  for (const p of paras) {
    // Kill inline indent styles
    p.style.textIndent = '0';
    if (p.style.marginLeft) p.style.marginLeft = '0';
    if (p.style.paddingLeft) p.style.paddingLeft = '';

    // Remove leading non-breaking spaces or normal spaces in the HTML
    // (safe: only at very start)
    const html = p.innerHTML;
    const cleaned = html.replace(/^(?:&nbsp;|\s)+/i, '');
    if (cleaned !== html) p.innerHTML = cleaned;
  }

  // 2) Some themes wrap first para in a styled container — zero any text-indent anywhere
  const styled = root.querySelectorAll('[style]');
  for (const el of styled) {
    const ti = el.style.textIndent;
    if (ti && ti !== '0' && ti !== '0px') el.style.textIndent = '0';
    if (el.style.marginLeft) el.style.marginLeft = '0';
    // don’t force padding-left universally (can be layout), but remove obvious indent:
    if (el.style.paddingLeft && /^([12]em|[12]0px)$/i.test(el.style.paddingLeft.trim())) {
      el.style.paddingLeft = '';
    }
  }
}

function renderBackButton() {
  const wrap = createEl('div', { style: 'margin-top: 1.25em;' });
  const btn = createEl('button', { class: 'btn', type: 'button' });
  btn.textContent = 'Back to posts';
  btn.addEventListener('click', () => { location.hash = '#/'; });
  wrap.append(btn);
  return wrap;
}

export async function renderPost(id) {
  const host = document.getElementById('app') || document.body;
  host.innerHTML = `
    <article class="post-detail">
      <div class="content-wrap"></div>
    </article>
  `;

  const shell = host.querySelector('.post-detail .content-wrap');

  try {
    const post = await fetchPostById(id);

    // Title (force brand blue)
    const h1 = createEl('h1', { class: 'title' });
    h1.textContent = decodeEntity(post?.title?.rendered || 'Untitled');
    h1.style.color = '#1E90FF';
    shell.append(h1);

    // Meta line (author + date)
    const meta = createEl('div', { class: 'meta' });
    const authorName = getAuthorName(post, /*fallback*/ null);
    const dateStr = formatDate(post?.date);
    meta.textContent = `${authorName ? `By ${authorName}` : ''}${authorName && dateStr ? ' • ' : ''}${dateStr}`;
    shell.append(meta);

    // Hero image (clickable to first video link if present)
    const heroSrc = getFeaturedImage(post);
    if (heroSrc) {
      const img = createEl('img', { class: 'hero', src: heroSrc, alt: '' });
      img.dataset.clickable = 'false';
      try {
        const contentHtml = String(post?.content?.rendered || '');
        const m = contentHtml.match(
          /https?:\/\/(?:www\.)?(?:facebook|youtu\.be|youtube|vimeo)\.[^\s"'<)]+/i
        );
        if (m) {
          img.dataset.clickable = 'true';
          img.style.cursor = 'pointer';
          img.addEventListener('click', () => window.open(m[0], '_blank', 'noopener'));
        }
      } catch {}
      shell.append(img);
    }

    // Post content
    const contentDiv = createEl('div', { class: 'content' });
    contentDiv.innerHTML = post?.content?.rendered || '';

    // 🚫 Ensure no paragraph indentation survives inline styles or &nbsp;
    normalizeIndentation(contentDiv);

    shell.append(contentDiv);

    // Only bottom “Back to posts” button
    shell.append(renderBackButton());

    // Detail starts at top
    window.scrollTo(0, 0);

  } catch (err) {
    console.error('[OkObserver] Post load failed:', err);
    host.innerHTML = `<p>Sorry, this post could not be loaded.</p>`;
  }
}
