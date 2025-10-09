// detail.js — single post view
// v2.5.8
// - Stronger first-paragraph de-indent covering &nbsp;/&emsp;/thin-spaces,
//   inline span indent shims, and small left paddings/margins on wrappers.
// - Keeps title blue, author/date meta, clickable hero to first video link,
//   and only a bottom “Back to posts” button.

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
 * Normalize/strip indentation artifacts commonly injected by WP content:
 *  - Leading HTML entities and Unicode spaces (&nbsp;, &emsp;, \u2000-\u200A, \t)
 *  - Inline span "indent shims" (display:inline-block; width <= ~48px)
 *  - text-indent, margin-left, padding-left (small/indent-like) on <p> and wrappers
 */
function normalizeIndentation(root) {
  if (!root) return;

  // Helper: strip leading “space-like” at the start of HTML/text
  const STRIP_LEADING_HTML_SPACES_RE = /^(?:&nbsp;|&ensp;|&emsp;|\s)+/i;
  const STRIP_LEADING_UNICODE_SPACES_RE = /^[\u00A0\u2000-\u200A\u202F\u205F\u3000\t ]+/;

  // Helper: treat small left spacing as indent (<= 3em OR <= 48px)
  const isSmallIndent = (v = '') => {
    const s = String(v).trim().toLowerCase();
    if (!s) return false;
    const m = s.match(/^(-?\d*\.?\d+)(px|em|rem)?$/);
    if (!m) return false;
    const num = parseFloat(m[1]);
    const unit = m[2] || 'px';
    if (Number.isNaN(num)) return false;
    if (unit === 'px') return Math.abs(num) <= 48;
    if (unit === 'em' || unit === 'rem') return Math.abs(num) <= 3.0;
    return false;
  };

  // 1) Clean paragraphs (and especially the first one)
  const paras = root.querySelectorAll('p');
  for (const p of paras) {
    // Remove inline indent styles on the paragraph itself
    if (p.style.textIndent && p.style.textIndent !== '0' && p.style.textIndent !== '0px') {
      p.style.textIndent = '0';
    }
    if (p.style.marginLeft && isSmallIndent(p.style.marginLeft)) {
      p.style.marginLeft = '0';
    }
    if (p.style.paddingLeft && isSmallIndent(p.style.paddingLeft)) {
      p.style.paddingLeft = '';
    }

    // Remove leading HTML entities (&nbsp;, &emsp;) in the innerHTML ONLY at start
    if (p.innerHTML) {
      const cleanedHtml = p.innerHTML.replace(STRIP_LEADING_HTML_SPACES_RE, '');
      if (cleanedHtml !== p.innerHTML) p.innerHTML = cleanedHtml;
    }

    // Remove leading Unicode spaces in first text node, if any
    const firstNode = p.firstChild;
    if (firstNode && firstNode.nodeType === Node.TEXT_NODE && firstNode.nodeValue) {
      const trimmed = firstNode.nodeValue.replace(STRIP_LEADING_UNICODE_SPACES_RE, '');
      if (trimmed !== firstNode.nodeValue) firstNode.nodeValue = trimmed;
    }

    // Remove small-width indent shims like:
    // <span style="display:inline-block;width:2em"> </span>
    const spans = p.querySelectorAll('span[style], i[style], em[style]');
    for (const el of spans) {
      const style = el.style;
      const disp = (style.display || '').toLowerCase();
      const w = style.width || '';
      if (disp.includes('inline-block') && isSmallIndent(w)) {
        // drop it if it only contains spaces
        const text = (el.textContent || '').trim();
        if (!text) {
          el.remove();
        }
      }
    }
  }

  // 2) Zero-out indent-like styles on any wrapper that might be imposing indent
  const styled = root.querySelectorAll('[style]');
  for (const el of styled) {
    if (el.style.textIndent && el.style.textIndent !== '0' && el.style.textIndent !== '0px') {
      el.style.textIndent = '0';
    }
    if (el.style.marginLeft && isSmallIndent(el.style.marginLeft)) {
      el.style.marginLeft = '0';
    }
    if (el.style.paddingLeft && isSmallIndent(el.style.paddingLeft)) {
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

    // 🚫 Ensure no paragraph indentation survives inline styles or non-breaking spaces
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
