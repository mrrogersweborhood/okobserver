// detail.js — single post view
// v2.5.9
// - Stronger de-indent:
//   * clears inline + class-based (computed) left indents on the first text block
//   * climbs up to 2 wrapper ancestors to neutralize margin/padding/text-indent
//   * strips leading &nbsp;/&emsp;/thin spaces/& tabs
//   * removes tiny inline-block "shim" spans
// - Title stays brand blue, author/date meta intact
// - Hero clickable to first fb/youtube/vimeo link if present
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

/* ---------- indent normalization helpers ---------- */

const STRIP_LEADING_HTML_SPACES_RE = /^(?:&nbsp;|&ensp;|&emsp;|\s)+/i;
const STRIP_LEADING_UNICODE_SPACES_RE = /^[\u00A0\u2000-\u200A\u202F\u205F\u3000\t ]+/;
/** treat small left spacing as indent (<= 3em OR <= 48px) */
function isSmallIndent(v = '') {
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
}

/** clear inline indent-like styles on element */
function clearInlineIndent(el) {
  if (!el || !el.style) return;
  if (el.style.textIndent && el.style.textIndent !== '0' && el.style.textIndent !== '0px') el.style.textIndent = '0';
  if (el.style.marginLeft && isSmallIndent(el.style.marginLeft)) el.style.marginLeft = '0';
  if (el.style.paddingLeft && isSmallIndent(el.style.paddingLeft)) el.style.paddingLeft = '';
}

/** neutralize *computed* indent by writing inline zeroes (covers class-based CSS) */
function clearComputedIndent(el) {
  if (!el) return;
  const cs = getComputedStyle(el);
  // Only zero “indent-like” small values to avoid nuking legit layout
  if (isSmallIndent(cs.textIndent)) el.style.textIndent = '0';
  if (isSmallIndent(cs.marginLeft)) el.style.marginLeft = '0';
  if (isSmallIndent(cs.paddingLeft)) el.style.paddingLeft = '';
}

/** remove leading entities/spaces and shim spans from a paragraph */
function cleanParagraphText(p) {
  if (!p) return;
  // strip leading entities in HTML
  if (p.innerHTML) {
    const cleaned = p.innerHTML.replace(STRIP_LEADING_HTML_SPACES_RE, '');
    if (cleaned !== p.innerHTML) p.innerHTML = cleaned;
  }
  // strip leading unicode spaces/tabs in text node
  const n = p.firstChild;
  if (n && n.nodeType === Node.TEXT_NODE && n.nodeValue) {
    const trimmed = n.nodeValue.replace(STRIP_LEADING_UNICODE_SPACES_RE, '');
    if (trimmed !== n.nodeValue) n.nodeValue = trimmed;
  }
  // remove small-width inline-block shim spans
  const spans = p.querySelectorAll('span[style], i[style], em[style]');
  for (const el of spans) {
    const disp = (el.style.display || '').toLowerCase();
    const w = el.style.width || '';
    if (disp.includes('inline-block') && isSmallIndent(w)) {
      const txt = (el.textContent || '').trim();
      if (!txt) el.remove();
    }
  }
}

/** find the first real text block (p/div/section/article/blockquote) with some text */
function findFirstTextBlock(root) {
  if (!root) return null;
  const candidates = root.querySelectorAll('p, div, section, article, blockquote');
  for (const el of candidates) {
    // Skip empty or media-only
    const text = (el.textContent || '').replace(/\s+/g, '');
    if (text.length > 0) return el;
  }
  return null;
}

/** main normalizer: clears inline & computed left indents on first text block and parents */
function normalizeIndentation(root) {
  if (!root) return;

  // 1) Blanket inline cleanup on all <p> and [style] wrappers
  root.querySelectorAll('p').forEach((p) => {
    clearInlineIndent(p);
    cleanParagraphText(p);
  });
  root.querySelectorAll('[style]').forEach((el) => {
    clearInlineIndent(el);
  });

  // 2) Target the *first* real text block and neutralize its computed indent
  const firstBlock = findFirstTextBlock(root);
  if (firstBlock) {
    clearInlineIndent(firstBlock);
    clearComputedIndent(firstBlock);

    // Also climb up to 2 ancestors inside the content area and neutralize small computed indents
    let up = firstBlock.parentElement;
    let hops = 0;
    while (up && hops < 2 && root.contains(up)) {
      clearInlineIndent(up);
      clearComputedIndent(up);
      up = up.parentElement;
      hops++;
    }
  }

  // 3) If a lone blockquote is used to indent the first paragraph, neutralize its left offset
  // (we do not unwrap, we just remove the indent — keeps semantics)
  const bq = root.querySelector('blockquote');
  if (bq) {
    clearInlineIndent(bq);
    clearComputedIndent(bq);
    // Some themes add borders for quote “indent”; suppress if it’s just acting as an indent shim
    const cs = getComputedStyle(bq);
    const hasLeftBorder = parseFloat(cs.borderLeftWidth || '0') > 0;
    if (hasLeftBorder && isSmallIndent(cs.marginLeft || '0px')) {
      bq.style.borderLeft = 'none';
    }
  }
}

/* ---------- UI pieces ---------- */

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

    // 🚫 Ensure the first paragraph cannot be indented by inline, class, or wrappers
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
