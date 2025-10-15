// detail.v263.js
// OkObserver - Post detail renderer (v2.6.x)
// - FB video embed support
// - Back-to-posts button spacing
// - Title/author/date below media

import { fmtDate, qs, qsa, el, ap, safeHTML, fetchWithRetry } from './utils.js';

const API = window.OKO && window.OKO.apiBase;
if (!API) {
  console.error('[Detail] API base missing.');
}

function makeBackButton() {
  const wrap = el('div', {
    class: 'detail-back-wrap',
    style:
      'display:flex;justify-content:flex-start;margin:16px 0 8px 0;position:sticky;top:0;z-index:2;'
  });
  const btn = el(
    'a',
    {
      href: '#/',
      class:
        'btn-back',
      style:
        'display:inline-block;background:#e9f2ff;border:1px solid #b9d6ff;border-radius:9999px;padding:8px 12px;font-weight:600;text-decoration:none;color:#0b63ce;box-shadow:0 1px 0 rgba(0,0,0,.05)'
    },
    '← Back to Posts'
  );
  ap(wrap, btn);
  return wrap;
}

function facebookEmbedIframeFromUrl(fbPostUrl) {
  // Use FB post plugin (works for videos too; FB decides rendering)
  const src =
    'https://www.facebook.com/plugins/post.php?href=' +
    encodeURIComponent(fbPostUrl) +
    '&show_text=true&width=700';

  const iframe = el('iframe', {
    src,
    width: '700',
    height: '525',
    style: 'border:none;overflow:hidden;max-width:100%;width:100%;aspect-ratio: 4 / 3;',
    scrolling: 'no',
    frameborder: '0',
    allow:
      'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share',
    allowfullscreen: 'true'
  });

  return iframe;
}

function extractFirstFacebookLinkFromHTML(html) {
  // 1) explicit <a href="https://www.facebook.com/...">
  const anchorMatch = html.match(
    /<a[^>]+href=["'](https?:\/\/(?:www\.)?facebook\.com\/[^"']+)["']/i
  );
  if (anchorMatch) return anchorMatch[1];

  // 2) plain URL present in text (rare after WP formatting)
  const urlMatch = html.match(
    /(https?:\/\/(?:www\.)?facebook\.com\/[^\s<"]+)/i
  );
  if (urlMatch) return urlMatch[1];

  return null;
}

function heroMediaFromPost(post) {
  // Prefer FB embed if present in content
  const content = post?.content?.rendered || '';
  const fbUrl = extractFirstFacebookLinkFromHTML(content);

  if (fbUrl) {
    return facebookEmbedIframeFromUrl(fbUrl);
  }

  // fallback featured image if available via _embedded
  const media =
    post?._embedded?.['wp:featuredmedia'] &&
    post._embedded['wp:featuredmedia'][0];

  if (media && media.source_url) {
    const img = el('img', {
      src: media.source_url,
      alt: media.alt_text || post.title?.rendered || 'Featured image',
      style:
        'width:100%;height:auto;display:block;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.06)'
    });
    return img;
  }

  return null;
}

function authorLine(post) {
  const name =
    (post?._embedded?.author && post._embedded.author[0]?.name) ||
    'Oklahoma Observer';
  const date = fmtDate(post?.date);
  const line = el(
    'div',
    {
      class: 'detail-meta',
      style:
        'color:#52616b;font-size:14px;margin:8px 0 12px 0;'
    },
    `By ${name} — ${date}`
  );
  return line;
}

function cleanContentHTML(html) {
  // Trim giant empty wrappers WP sometimes injects.
  // Also remove lone <div class="mceTemp"></div> blocks
  let out = html
    .replace(/<div class="mceTemp"><\/div>/g, '')
    .replace(/<p>\s*<\/p>/g, '');
  return out;
}

async function renderDetail(container, id) {
  container.innerHTML = '';

  ap(container, makeBackButton());

  const card = el('article', {
    class: 'detail-card',
    style:
      'background:#fff;border:1px solid #e6e8eb;border-radius:14px;max-width:980px;margin:0 auto 56px;box-shadow:0 1px 2px rgba(0,0,0,.05);padding:18px 18px 24px 18px;'
  });

  const mediaBox = el('div', {
    style: 'width:100%;margin:4px 0 12px 0;'
  });

  const titleBox = el('div', { style: 'margin:8px 0;' });
  const title = el(
    'h1',
    {
      style:
        'font-size:28px;line-height:1.2;margin:0 0 4px 0;letter-spacing:.2px;'
    },
    safeHTML((window.DOMPurify && window.DOMPurify.sanitize(post.title?.rendered)) || '')
  );

  // Fetch post
  let post;
  try {
    post = await fetchWithRetry(
      `${API}/posts/${id}?_embed=1`,
      { mode: 'cors' },
      2
    ).then((r) => r.json());
  } catch (e) {
    card.innerHTML =
      '<p style="color:#c1121f">Failed to load post.</p>';
    ap(container, card);
    return;
  }

  // HERO media (FB embed or featured image)
  const hero = heroMediaFromPost(post);
  if (hero) ap(mediaBox, hero);

  // Title/Meta AFTER media
  title.innerHTML = post?.title?.rendered || '';
  ap(titleBox, title);
  ap(titleBox, authorLine(post));

  // Content
  const contentBox = el('div', {
    class: 'detail-content',
    style:
      'font-size:17px;line-height:1.68;color:#222;'
  });
  contentBox.innerHTML = cleanContentHTML(post?.content?.rendered || '');

  // Assemble
  ap(card, mediaBox);
  ap(card, titleBox);
  ap(card, contentBox);

  ap(container, card);

  // Add another back button at the end (real button style)
  const tailBack = makeBackButton();
  tailBack.style.margin = '8px 0 0 0';
  ap(container, tailBack);

  // Clicks on internal links should not leave the SPA
  card.addEventListener('click', (ev) => {
    const a = ev.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#/')) {
      // our internal route, let router handle it
      ev.preventDefault();
      window.location.hash = href.slice(1);
    }
  });
}

export default async function start(app, id) {
  const container = el('div', { class: 'detail-root', style: 'padding:10px 12px 24px;' });
  app.innerHTML = '';
  ap(app, container);
  await renderDetail(container, id);
}
