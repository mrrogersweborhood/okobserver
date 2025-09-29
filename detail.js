// detail.js – single post detail view

import { fetchPost } from './api.js';
import { ordinalDate } from './shared.js';   // ensure this is where ordinalDate lives

export async function renderPost(id) {
  const container = document.getElementById('app');
  container.innerHTML = '<p class="center">Loading…</p>';

  try {
    const post = await fetchPost(id);
    const date = new Date(post.date);

    container.innerHTML = `
      <article class="post">
        <h1>${post.title.rendered}</h1>
        <div class="meta-author-date">
          <span>${post._embedded?.author?.[0]?.name || ''}</span>
          <span class="date">${ordinalDate(date)}</span>  <!-- unified date format -->
        </div>
        ${post.featured_media && post._embedded?.['wp:featuredmedia']?.[0]
          ? `<img class="hero" src="${post._embedded['wp:featuredmedia'][0].source_url}" alt="">`
          : ''}
        <div class="content">${post.content.rendered}</div>
        <div style="margin-top:1.5rem">
          <a class="btn" href="#/">Back to posts</a>
        </div>
      </article>
    `;
  } catch (err) {
    container.innerHTML = `<p class="center">Error loading post.</p>`;
    console.error('[OkObserver] Failed to render post', err);
  }
}
