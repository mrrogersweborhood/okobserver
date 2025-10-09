// detail.js — single post view
// v2.6.2
// - Always uses a clickable *poster image* for Facebook videos (so you always see something clickable)
// - Keeps timeout-fallback poster for YouTube/Vimeo if an iframe is blocked/slow
// - Poster priority: inline <a><img> next to the video → featured image → first inline image → local logo/icon
// - Strong de-indent for first paragraph (handles inline/class/wrapper shims)
// - Title stays brand blue, author/date meta intact
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

/* ---------- indent normalization ---------- */
const STRIP_LEADING_HTML_SPACES_RE = /^(?:&nbsp;|&ensp;|&emsp;|\s)+/i;
const STRIP_LEADING_UNICODE_SPACES_RE = /^[\u00A0\u2000-\u200A\u202F\u205F\u3000\t ]+/;

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
function setImportant(el, prop, value) {
  try { el.style.setProperty(prop, value, 'important'); } catch { el.style[prop] = value; }
}
function clearInlineIndent(el) {
  if (!el || !el.style) return;
  if (el.style.textIndent && el.style.textIndent !== '0' && el.style.textIndent !== '0px') setImportant(el, 'text-indent', '0');
  if (el.style.marginLeft && isSmallIndent(el.style.marginLeft)) setImportant(el, 'margin-left', '0');
  if (el.style.paddingLeft && isSmallIndent(el.style.paddingLeft)) setImportant(el, 'padding-left', '0');
}
function clearComputedIndent(el, hard = false) {
  if (!el) return;
  const cs = getComputedStyle(el);
  if (hard) { setImportant(el,'text-indent','0'); setImportant(el,'margin-left','0'); setImportant(el,'padding-left','0'); return; }
  if (isSmallIndent(cs.textIndent)) setImportant(el, 'text-indent', '0');
  if (isSmallIndent(cs.marginLeft)) setImportant(el, 'margin-left', '0');
  if (isSmallIndent(cs.paddingLeft)) setImportant(el, 'padding-left', '0');
}
function cleanParagraphText(p) {
  if (!p) return;
  if (p.innerHTML) {
    const cleaned = p.innerHTML.replace(STRIP_LEADING_HTML_SPACES_RE, '');
    if (cleaned !== p.innerHTML) p.innerHTML = cleaned;
  }
  const n = p.firstChild;
  if (n && n.nodeType === Node.TEXT_NODE && n.nodeValue) {
    const trimmed = n.nodeValue.replace(STRIP_LEADING_UNICODE_SPACES_RE, '');
    if (trimmed !== n.nodeValue) n.nodeValue = trimmed;
  }
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
function findFirstTextBlock(root) {
  if (!root) return null;
  const candidates = root.querySelectorAll('p, div, section, article, blockquote');
  for (const el of candidates) {
    const text = (el.textContent || '').replace(/\s+/g, '');
    if (text.length > 0) return el;
  }
  return null;
}
function normalizeIndentation(root) {
  if (!root) return;
  root.querySelectorAll('p').forEach((p) => { clearInlineIndent(p); cleanParagraphText(p); });
  root.querySelectorAll('[style]').forEach((el) => { clearInlineIndent(el); });

  const firstBlock = findFirstTextBlock(root);
  if (firstBlock) {
    clearComputedIndent(firstBlock, true);
    clearInlineIndent(firstBlock);
    cleanParagraphText(firstBlock.tagName === 'P' ? firstBlock : null);
    let up = firstBlock.parentElement, hops = 0;
    while (up && hops < 3 && root.contains(up)) {
      clearComputedIndent(up, false); clearInlineIndent(up);
      up = up.parentElement; hops++;
    }
  }
  const bq = root.querySelector('blockquote');
  if (bq) {
    clearInlineIndent(bq); clearComputedIndent(bq, false);
    const cs = getComputedStyle(bq);
    const hasLeftBorder = parseFloat(cs.borderLeftWidth || '0') > 0;
    if (hasLeftBorder && isSmallIndent(cs.marginLeft || '0px')) {
      setImportant(bq, 'border-left', 'none');
      setImportant(bq, 'padding-left', '0');
      setImportant(bq, 'margin-left', '0');
    }
  }
}

/* ---------- video helpers (always-poster for Facebook) ---------- */

const ALWAYS_POSTER_HOSTS = /facebook\.com/i;
const VIDEO_HOST_RE = /(facebook\.com|youtu\.be|youtube\.com|vimeo\.com)/i;

function findFirstVideoUrlFromHTML(html) {
  if (!html) return null;
  const m = html.match(/https?:\/\/(?:www\.)?(?:facebook|youtu\.be|youtube|vimeo)\.[^\s"'<)]+/i);
  return m ? m[0] : null;
}

function findInlinePosterForUrl(root, url) {
  if (!root || !url) return null;
  let host = '';
  try { host = new URL(url).hostname; } catch {}
  const anchors = Array.from(root.querySelectorAll('a[href]')).filter(a => a.href && a.href.includes(host));
  for (const a of anchors) {
    const img = a.querySelector('img');
    if (img && img.src) return img.src;
  }
  return null;
}

function findFirstInlineImage(root) {
  const img = root.querySelector('img');
  return img && img.src ? img.src : null;
}

function makePosterLink(href, posterSrc) {
  const a = createEl('a', { href, class: 'video-poster', target: '_blank', rel: 'noopener' });
  const img = createEl('img', { src: posterSrc, alt: '' });
  a.append(img);
  return a;
}

function dedupePlayers(container) {
  const iframes = Array.from(container.querySelectorAll('iframe'))
    .filter(f => f.src && VIDEO_HOST_RE.test(f.src));
  if (iframes.length <= 1) return;
  for (let i = 1; i < iframes.length; i++) {
    const wrap = iframes[i].closest('.embed') || iframes[i];
    wrap.remove();
  }
}

function replaceEmbedWithPoster(embedEl, href, posterSrc) {
  if (!embedEl) return;
  embedEl.classList.add('failed');
  embedEl.innerHTML = ''; // collapse padding
  if (href && posterSrc) {
    embedEl.replaceWith(makePosterLink(href, posterSrc));
  } else {
    embedEl.remove(); // no gap
  }
}

function wireEmbedFallbacks(contentDiv, heroSrc) {
  const embeds = Array.from(contentDiv.querySelectorAll('.embed'));
  if (!embeds.length) return;

  dedupePlayers(contentDiv);

  for (const wrap of embeds) {
    const iframe = wrap.querySelector('iframe');
    if (!iframe || !iframe.src || !VIDEO_HOST_RE.test(iframe.src)) continue;

    // Compute best click target & poster
    let targetUrl = iframe.src;
    let posterUrl = findInlinePosterForUrl(contentDiv, targetUrl)
                  || heroSrc
                  || findFirstInlineImage(contentDiv)
                  || 'Observer-Logo-2015-08-05.png';

    // If there’s a nearby anchor that matches the host, prefer its href and image
    const nearbyA = wrap.previousElementSibling?.matches?.('a[href]') ? wrap.previousElementSibling
                   : wrap.nextElementSibling?.matches?.('a[href]') ? wrap.nextElementSibling
                   : null;
    if (nearbyA && nearbyA.href && VIDEO_HOST_RE.test(nearbyA.href)) {
      targetUrl = nearbyA.href;
      const img = nearbyA.querySelector('img');
      if (img && img.src) posterUrl = img.src;
    }

    // **Policy**:
    // - Facebook: ALWAYS show a poster (prevents “unavailable” blank area)
    // - Others: keep iframe unless it’s slow/blocked, then swap to poster by timeout
    if (ALWAYS_POSTER_HOSTS.test(iframe.src)) {
      replaceEmbedWithPoster(wrap, targetUrl, posterUrl);
      continue;
    }

    // Timeout fallback for YT/Vimeo/etc
    let done = false;
    const kill = () => {
      if (done) return;
      done = true;
      replaceEmbedWithPoster(wrap, targetUrl, posterUrl);
    };
    const timer = setTimeout(kill, 3500);

    iframe.addEventListener('load', () => {
      if (done) return;
      clearTimeout(timer);
    }, { once: true });

    iframe.addEventListener('error', () => {
      kill();
    }, { once: true });
  }
}

/* ---------- UI ---------- */

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

    // Title (brand blue)
    const h1 = createEl('h1', { class: 'title' });
    h1.textContent = decodeEntity(post?.title?.rendered || 'Untitled');
    h1.style.color = '#1E90FF';
    shell.append(h1);

    // Meta (author + date)
    const meta = createEl('div', { class: 'meta' });
    const authorName = getAuthorName(post, null);
    const dateStr = formatDate(post?.date);
    meta.textContent = `${authorName ? `By ${authorName}` : ''}${authorName && dateStr ? ' • ' : ''}${dateStr}`;
    shell.append(meta);

    // Hero (clickable to first video url if present)
    const heroSrc = getFeaturedImage(post);
    if (heroSrc) {
      const img = createEl('img', { class: 'hero', src: heroSrc, alt: '' });
      img.dataset.clickable = 'false';
      try {
        const contentHtml = String(post?.content?.rendered || '');
        const m = findFirstVideoUrlFromHTML(contentHtml);
        if (m) {
          img.dataset.clickable = 'true';
          img.style.cursor = 'pointer';
          img.addEventListener('click', () => window.open(m, '_blank', 'noopener'));
        }
      } catch {}
      shell.append(img);
    }

    // Content
    const contentDiv = createEl('div', { class: 'content' });
    contentDiv.innerHTML = post?.content?.rendered || '';

    // Remove unwanted first-paragraph indentation
    normalizeIndentation(contentDiv);

    // Video: poster fallback wiring (ALWAYS poster for Facebook)
    wireEmbedFallbacks(contentDiv, heroSrc || null);

    shell.append(contentDiv);

    // Bottom “Back to posts” button
    shell.append(renderBackButton());

    window.scrollTo(0, 0);
  } catch (err) {
    console.error('[OkObserver] Post load failed:', err);
    host.innerHTML = `<p>Sorry, this post could not be loaded.</p>`;
  }
}
