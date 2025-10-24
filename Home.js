// Home.js — Posts grid (v2025-10-24a)
// Renders the home feed with 4/3/1 responsive columns (CSS handles layout).
// Shows: poster image (if available), decoded title, and plain-text excerpt.
// Filters out posts in the "cartoon" category.

import { fetchPosts, extractMedia } from "./api.js?v=2025-10-24a";
import { decodeHTML } from "./util.js?v=2025-10-24a";

/* ----------------------------- Helpers ----------------------------- */

function isCartoon(post) {
  // WP REST: categories embedded at _embedded['wp:term'][0]
  const cats = post?._embedded?.["wp:term"]?.[0] || [];
  return cats.some(c => String(c?.slug || "").toLowerCase() === "cartoon");
}

function stripTags(html = "") {
  return html.replace(/<[^>]*>/g, "");
}

function cleanText(input = "") {
  // Strip HTML, then decode entities (e.g., &#8217; → ’)
  return decodeHTML(stripTags(String(input))).trim();
}

function safeExcerpt(post) {
  // Prefer excerpt; fall back to truncated content
  const src = post?.excerpt?.rendered || post?.content?.rendered || "";
  const txt = cleanText(src);
  // Light clamp in case the theme CSS doesn’t line-clamp
  return txt.length > 220 ? txt.slice(0, 217) + "…" : txt;
}

function cardHTML(post) {
  const href = `#/post/${post.id}`;
  const title = cleanText(post?.title?.rendered || "Untitled");
  const excerpt = safeExcerpt(post);
  const poster = extractMedia(post);

  const figure = poster
    ? `<img src="${poster}" alt="" loading="lazy" decoding="async">`
    : `<div style="height:180px;background:#f3f4f6;border-bottom:1px solid #eee;"></div>`;

  return `
    <article class="post-card">
      <a href="${href}" data-link aria-label="${title}">
        ${figure}
        <h2>${title}</h2>
      </a>
      <div class="meta">${excerpt}</div>
    </article>
  `;
}

/* ----------------------------- Render ------------------------------ */

export async function renderHome(rootEl) {
  // Lightweight skeleton while we fetch
  rootEl.innerHTML = `
    <section class="grid" aria-busy="true" aria-live="polite">
      ${Array.from({ length: 8 }).map(() => `
        <article class="post-card" aria-hidden="true">
          <div style="height:180px;background:#e5e7eb;border-bottom:1px solid #eee;"></div>
          <h2 style="height:1.1rem;margin:.75rem 1rem .25rem;background:#eee;border-radius:6px;"></h2>
          <div class="meta" style="height:3rem;margin:0 1rem 1rem;background:#f5f5f5;border-radius:6px;"></div>
        </article>
      `).join("")}
    </section>
  `;

  try {
    const posts = await fetchPosts(1, 24);

    // Business rule: hide "cartoon" category posts from the feed.
    const filtered = posts.filter(p => !isCartoon(p));

    const html = `
      <section class="grid" aria-busy="false">
        ${filtered.map(cardHTML).join("")}
      </section>
    `;

    rootEl.innerHTML = html;

  } catch (err) {
    console.error("[Home] Failed to render posts:", err);
    rootEl.innerHTML = `
      <section class="grid">
        <article class="card" style="padding:1.25rem;">
          <h2 style="margin:0 0 .5rem;">Unable to load posts</h2>
          <p style="margin:0;">${cleanText(err?.message) || "Please try again."}</p>
        </article>
      </section>
    `;
  }
}

export default { renderHome };
