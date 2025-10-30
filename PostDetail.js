/* PostDetail.js — OkObserver
   v2025-10-30k
   - Fix: robust video detection for modern WP embeds (wp-block-embed, Jetpack, iframes)
   - Keeps click-to-play overlay, renders proper <iframe> once src is resolved
   - Leaves only the bottom “Back to Posts” button (left-justified)
   - Shows WP-provided paywall/login copy when body is truncated by WordPress
*/

import { getPost } from './api.js?v=2025-10-30k';

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function makeEl(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
}

/** Try hard to find an embeddable video URL from WP content HTML. */
function findVideoSrcInHTML(html) {
  if (!html) return null;

  // Work in a sandbox DOM
  const div = document.createElement('div');
  div.innerHTML = html;

  // 1) Direct iframes from YouTube/Vimeo (most reliable, fastest path)
  const iframe = div.querySelector('iframe[src*="youtube.com"], iframe[src*="youtu.be"], iframe[src*="vimeo.com"], iframe[src*="player.vimeo.com"]');
  if (iframe && iframe.src) return sanitizeEmbedUrl(iframe.src);

  // 2) Modern Gutenberg/Jetpack wrappers that contain the watch URL as text
  //    e.g. <div class="wp-block-embed__wrapper">https://www.youtube.com/watch?v=xyz</div>
  const wrapper = div.querySelector('.wp-block-embed__wrapper, .jetpack-video-wrapper, figure.wp-block-embed .wp-block-embed__wrapper');
  if (wrapper) {
    const url = (wrapper.textContent || '').trim();
    if (url.startsWith('http')) {
      return toEmbedUrl(url);
    }
  }

  // 3) Jetpack video link in an anchor (some themes wrap it)
  const a = div.querySelector('a[href*="youtube.com"], a[href*="youtu.be"], a[href*="vimeo.com"]');
  if (a && a.href) return toEmbedUrl(a.href);

  // 4) Legacy regex fallback
  const m = html.match(/src="([^"]+(youtube\.com|youtu\.be|vimeo\.com)[^"]+)"/i);
  if (m) return sanitizeEmbedUrl(m[1]);

  return null;
}

function sanitizeEmbedUrl(url) {
  try {
    const u = new URL(url, location.origin);
    // Force embed hosts
    if (u.hostname.includes('youtube.com') && u.pathname === '/watch') {
      // /watch?v=ID => /embed/ID
      const id = u.searchParams.get('v');
      if (id) {
        u.pathname = `/embed/${id}`;
        u.search = '';
      }
    }
    if (u.hostname === 'youtu.be') {
      // youtu.be/ID => youtube.com/embed/ID
      const id = u.pathname.slice(1);
      return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }
    if (u.hostname === 'vimeo.com') {
      // vimeo.com/ID => player.vimeo.com/video/ID
      const id = u.pathname.replace('/', '');
      return `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
    }
    return u.toString();
  } catch {
    return url;
  }
}

function toEmbedUrl(url) {
  // Convert “watch” or page URLs into embed URLs; otherwise keep as-is
  if (/youtube\.com\/watch\?v=/.test(url)) return url.replace('watch?v=', 'embed/').replace(/[?&].*$/, '');
  if (/youtu\.be\//.test(url)) {
    const id = url.split('/').pop().split(/[?&]/)[0];
    return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
  }
  if (/vimeo\.com\/\d+/.test(url)) {
    const id = url.split('/').pop().split(/[?&]/)[0];
    return `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
  }
  return url;
}

/** Create the media block: either image (possibly video poster + overlay) or iframe when known. */
function buildMedia(post) {
  const mediaWrap = makeEl('div', 'pd-media');

  // Prefer featured image URL we already compute server/proxy-side if present
  const featuredUrl = post.featured_media_url || null;

  // Try to detect a video in the content
  const videoSrc = findVideoSrcInHTML(post?.content?.rendered || '');

  if (videoSrc) {
    // Start with poster + play overlay (click-to-play), to keep initial load fast
    const outer = makeEl('div', 'video-wrap'); // 16:9 padded box via CSS
    const poster = makeEl('img', 'video-poster');
    poster.alt = post?.title?.rendered ? strip(post.title.rendered) : 'video';
    poster.loading = 'lazy';
    poster.decoding = 'async';
    poster.src = featuredUrl || ''; // may be blank; we still show the overlay box

    const overlay = makeEl('button', 'play-overlay', '<span aria-hidden="true">▶</span><span class="sr-only">Play video</span>');

    overlay.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = videoSrc;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      iframe.title = strip(post?.title?.rendered || 'Video');
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      outer.replaceChildren(iframe);
    });

    outer.append(poster, overlay);
    mediaWrap.appendChild(outer);
    return mediaWrap;
  }

  // Fallback: plain featured image if available
  if (featuredUrl) {
    const img = makeEl('img', 'pd-featured');
    img.alt = strip(post?.title?.rendered || 'featured image');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = featuredUrl;
    mediaWrap.appendChild(img);
  }

  return mediaWrap;
}

function strip(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return d.textContent || d.innerText || '';
}

/** Show WP-provided paywall/login messaging if WordPress withholds full content. */
function buildPaywallNotice(post) {
  // If WP returned an excerpt and the content is suspiciously short (or explicitly trimmed),
  // we show the WP-provided login/subscription messaging if present in the content HTML.
  const html = post?.content?.rendered || '';
  const container = makeEl('div', 'pd-paywall');

  // Look for common WP paywall/login text blocks produced by the site (kept as-is)
  // We preserve links/markup straight from WordPress to avoid inventing copy.
  const div = document.createElement('div');
  div.innerHTML = html;

  // Heuristic: paywall often embeds a paragraph with anchors to login / purchase pages,
  // or short “To access this content…” text preceding a “[…]” summary on this site.
  // Grab the first paragraph that contains either “log in” or “purchase” or “subscription”.
  const p = [...div.querySelectorAll('p, .paywall, .subscription, .login')].find(node => {
    const t = (node.textContent || '').toLowerCase();
    return /log\s*in|purchase|subscription|subscribe|total access|digital only|print only/.test(t);
  });

  if (p) {
    container.appendChild(makeEl('div', 'pd-paywall-box', p.outerHTML));
    return container;
  }

  // If we didn’t find a specific paragraph, but we know we only have an excerpt,
  // don’t fabricate copy; just return empty (the page will still show the excerpt).
  return null;
}

function buildTags(tags) {
  if (!tags || !tags.length) return null;
  const wrap = makeEl('div', 'pd-tags');
  const title = makeEl('div', 'pd-tags-title', 'Tags');
  const ul = makeEl('ul', 'pd-tags-list');
  tags.forEach(t => {
    const li = document.createElement('li');
    li.textContent = `#${t}`;
    ul.appendChild(li);
  });
  wrap.append(title, ul);
  return wrap;
}

export async function renderPost(postId) {
  const root = qs('#app');
  if (!root) return;

  // lightweight skeleton while fetching
  root.innerHTML = `
    <section class="post-detail skeleton">
      <div class="pd-media sk"></div>
      <h1 class="pd-title sk"></h1>
      <div class="pd-byline sk"></div>
      <div class="pd-body sk"></div>
    </section>
  `;

  let post;
  try {
    post = await getPost(postId);
  } catch (e) {
    console.error('[OkObserver] getPost failed', e);
    root.innerHTML = `
      <section class="post-detail">
        <p class="pd-error">Something went wrong loading this view.</p>
        <p class="pd-error-small">${strip(e?.message || 'Failed to fetch')}</p>
        <a class="btn back-btn" href="#/">Back to Posts</a>
      </section>
    `;
    return;
  }

  const titleText = strip(post?.title?.rendered || '');
  const bylineText = `${strip(post?.author_name || 'Oklahoma Observer')} • ${fmtDate(post?.date)}`;

  const media = buildMedia(post);

  // Prefer full content; otherwise show excerpt (WordPress decides what we get).
  const contentHTML = (post?.content?.rendered || '').trim();
  const excerptHTML = (post?.excerpt?.rendered || '').trim();

  // Detect if what we received looks truncated (common: ends with […] or very short while excerpt exists)
  const looksTruncated =
    (!!excerptHTML && (!contentHTML || contentHTML.length < excerptHTML.length)) ||
    /\[\s*…\s*\]|\[&hellip;]|&hellip;|\u2026/.test(contentHTML);

  const paywallNotice = looksTruncated ? buildPaywallNotice(post) : null;

  const body = makeEl('div', 'pd-body');
  body.innerHTML = contentHTML || excerptHTML || '';

  const wrap = makeEl('section', 'post-detail');
  wrap.appendChild(media);
  wrap.appendChild(makeEl('h1', 'pd-title', titleText));
  wrap.appendChild(makeEl('div', 'pd-byline', bylineText));

  if (paywallNotice) wrap.appendChild(paywallNotice);
  wrap.appendChild(body);

  // Tags (shown after post body)
  if (Array.isArray(post?.tags_simple) && post.tags_simple.length) {
    const tagsEl = buildTags(post.tags_simple);
    if (tagsEl) wrap.appendChild(tagsEl);
  }

  // Only one “Back to Posts” at the bottom, left-justified per spec
  const back = makeEl('a', 'btn back-btn', 'Back to Posts');
  back.href = '#/';
  wrap.appendChild(back);

  root.innerHTML = '';
  root.appendChild(wrap);

  // Accessibility: move focus to title
  const titleEl = qs('.pd-title', wrap);
  if (titleEl) titleEl.setAttribute('tabindex', '-1'), titleEl.focus();

  // Ensure images don’t blow out layout once loaded
  qsa('img', wrap).forEach(img => {
    img.addEventListener('load', () => {
      img.classList.add('ready');
    }, { once: true });
  });
}
