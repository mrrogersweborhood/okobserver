// detail.js — OkObserver Post Detail (v2.7.8)

import { apiFetch } from './api.js';
import { saveScrollForRoute } from './shared.js';

export async function renderPostDetail(postId) {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `<div id="loading" style="text-align:center;margin:2rem;color:#777;">Loading…</div>`;

  try {
    const postUrl = `${window.OKO_API_BASE_LOCKED || 'https://okobserver-proxy.bob-b5c.workers.dev/wp/v2'}/posts/${postId}?_embed=1`;
    const post = await apiFetch(postUrl);

    if (!post) throw new Error('Post not found');

    const title = post.title?.rendered ?? '(Untitled)';
    const content = post.content?.rendered ?? '';
    const author = post._embedded?.author?.[0]?.name ?? 'The Oklahoma Observer';
    const date = new Date(post.date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const fm = post._embedded?.['wp:featuredmedia']?.[0];
    let heroUrl = null;

    if (fm?.media_details?.sizes) {
      const sizes = fm.media_details.sizes;
      heroUrl =
        sizes?.large?.source_url ||
        sizes?.medium_large?.source_url ||
        sizes?.medium?.source_url ||
        fm?.source_url ||
        null;
    } else {
      heroUrl = fm?.source_url || null;
    }

    let videoEmbed = extractVideoEmbed(content);
    let heroSection = '';

    if (videoEmbed) {
      heroSection = `<div class="post-hero video-wrapper">${videoEmbed}</div>`;
    } else if (heroUrl) {
      heroSection = `
        <div class="post-hero">
          <img src="${heroUrl}" alt="${escapeHTML(title)}" loading="lazy" decoding="async">
        </div>
      `;
    }

    app.innerHTML = `
      <article class="post">
        ${heroSection}
        <h1 class="post-title">${title}</h1>
        <div class="post-meta">${escapeHTML(author)} — ${date}</div>
        <div class="post-content">${content}</div>
        <div style="text-align:center;margin-top:3rem;">
          <button id="backButton" class="back-btn">← Back to Posts</button>
        </div>
      </article>
    `;

    const backBtn = document.getElementById('backButton');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        saveScrollForRoute('#/');
        window.location.hash = '#/';
      });
    }

  } catch (err) {
    console.error('[OkObserver] Detail load failed:', err);
    app.innerHTML = `<p style="color:red;text-align:center;margin:2rem;">Failed to load post.</p>`;
  }
}

function extractVideoEmbed(html) {
  if (!html) return null;
  const div = document.createElement('div');
  div.innerHTML = html;
  const iframe = div.querySelector('iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="facebook"]');
  if (iframe) {
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.classList.add('video-embed');
    return iframe.outerHTML;
  }
  return null;
}

function escapeHTML(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
