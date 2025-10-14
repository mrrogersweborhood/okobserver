// detail.v263.js v2.65 — post detail (video-friendly)
import { fetchWithRetry, fmtDate, stripTags } from './utils.js';

const API = window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

function cleanWpArtifacts(scopeEl) {
  // Nuke empty WP placeholders / editor artifacts (prevents grey boxes)
  const selectors = [
    '.mceTemp', 'div.mceTemp',
    '.wp-block:empty', '.wp-block-image:empty', '.wp-block-video:empty',
    '.wp-block-embed__wrapper:empty',
    '.wp-block-embed:has(> iframe[src=""])',
    '.wp-block-embed:has(> a[href=""])',
    '.wp-block-embed[style*="padding-bottom:56.25%"]:empty'
  ];
  selectors.forEach(sel => scopeEl.querySelectorAll(sel).forEach(n => n.remove()));
}

function tryUpgradeVimeoAnchors(scopeEl) {
  // Convert <a href="https://vimeo.com/..."> to an iframe embed if present
  const anchors = scopeEl.querySelectorAll('a[href*="vimeo.com/"]');
  anchors.forEach(a => {
    const href = a.getAttribute('href') || '';
    const m = href.match(/vimeo\.com\/(\d+)/);
    if (m) {
      const id = m[1];
      const iframe = document.createElement('iframe');
      iframe.setAttribute('src', `https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0`);
      iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
      iframe.setAttribute('allowfullscreen', 'true');
      iframe.style.width = '100%';
      iframe.style.aspectRatio = '16/9';
      a.replaceWith(iframe);
    }
  });
}

export default async function renderPost(root, id) {
  root.innerHTML = `
    <section class="container container--detail">
      <a href="#/" class="back-link">← Back to Posts</a>
      <article id="post" class="post-detail">
        <h1 class="post-title">Loading…</h1>
        <div class="meta"></div>
        <div class="content"></div>
      </article>
    </section>
  `;

  const el = root.querySelector('#post');
  const titleEl = el.querySelector('.post-title');
  const metaEl = el.querySelector('.meta');
  const contentEl = el.querySelector('.content');

  // Fetch with embeds so we can get featured image & author
  const url = `${API}/posts/${id}?_embed=1`;
  let post;
  try {
    post = await fetchWithRetry(url);
  } catch (e) {
    el.innerHTML = `<p class="page-error">Page error: ${stripTags(e.message || e)}</p>`;
    return;
  }

  const title = post?.title?.rendered || '';
  const by = post?._embedded?.author?.[0]?.name || '';
  const date = fmtDate(post?.date);

  titleEl.innerHTML = title;
  metaEl.innerHTML = `${by ? `By ${by}` : ''}${date ? ` — <time>${date}</time>` : ''}`;

  // Prefer full content; fallback to excerpt
  const html = post?.content?.rendered || post?.excerpt?.rendered || '';
  contentEl.innerHTML = html;

  // Cleanup / upgrades
  cleanWpArtifacts(el);
  tryUpgradeVimeoAnchors(el);
}
