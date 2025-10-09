// detail.js — single post view
// v2.5.3 — forces blue title, and shows ONLY a bottom “Back to posts” button

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
    return ordinalDate ? ordinalDate(d) : d.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
  } catch { return ''; }
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

    // Title (force brand blue via CSS; also keep inline as hard override)
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

    // Hero image (clickable only if it actually links to something useful)
    const heroSrc = getFeaturedImage(post);
    if (heroSrc) {
      const img = createEl('img', { class: 'hero', src: heroSrc, alt: '' });
      img.dataset.clickable = 'false';
      // If content includes a video link we want to open in a new tab, make hero clickable
      try {
        const contentHtml = String(post?.content?.rendered || '');
        const m = contentHtml.match(/https?:\/\/(?:www\.)?(?:facebook|youtu\.be|youtube|vimeo)\.[^\s"'<)]+/i);
        if (m) {
          img.dataset.clickable = 'true';
          img.style.cursor = 'pointer';
          img.addEventListener('click', () => window.open(m[0], '_blank', 'noopener'));
        }
      } catch {}
      shell.append(img);
    }

    // Post content (clean minimal)
    const contentDiv = createEl('div', { class: 'content' });
    contentDiv.innerHTML = post?.content?.rendered || '';
    // Ensure first paragraph has no indentation
    const firstP = contentDiv.querySelector('p');
    if (firstP) firstP.style.textIndent = '0';
    shell.append(contentDiv);

    // ONLY bottom back button
    shell.append(renderBackButton());

  } catch (err) {
    console.error('[OkObserver] Post load failed:', err);
    host.innerHTML = `<p>Sorry, this post could not be loaded.</p>`;
  }
}
