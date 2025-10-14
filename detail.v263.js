// detail.v263.js v2.65
import { fetchWithRetry, fmtDate, stripTags } from './utils.js';
const API = window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

function cleanWpArtifacts(scope) {
  scope.querySelectorAll('.mceTemp, .wp-block:empty, .wp-block-image:empty, .wp-block-video:empty').forEach(n => n.remove());
}

function upgradeVimeo(scope) {
  scope.querySelectorAll('a[href*="vimeo.com/"]').forEach(a => {
    const m = (a.getAttribute('href') || '').match(/vimeo\.com\/(\d+)/);
    if (m) {
      const id = m[1];
      const iframe = document.createElement('iframe');
      iframe.src = `https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0`;
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.allowFullscreen = true;
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

  try {
    const post = await fetchWithRetry(`${API}/posts/${id}?_embed=1`);
    titleEl.innerHTML = post?.title?.rendered || '';
    const by = post?._embedded?.author?.[0]?.name || '';
    const date = fmtDate(post?.date);
    metaEl.innerHTML = `${by ? `By ${by}` : ''}${date ? ` — <time>${date}</time>` : ''}`;
    contentEl.innerHTML = post?.content?.rendered || post?.excerpt?.rendered || '';
  } catch (e) {
    el.innerHTML = `<p class="page-error">Page error: ${stripTags(e.message || e)}</p>`;
    return;
  }

  cleanWpArtifacts(el);
  upgradeVimeo(el);
}
