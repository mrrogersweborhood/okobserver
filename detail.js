// detail.js — uses shared.js utilities, one-pass sanitizer, and indent normalization

import { fetchPost } from "./api.js";
import {
  ordinalDate,
  decodeEntities,
  sanitizeContent,
  normalizeFirstParagraph,
  hardNukeIndent,
  selectHeroSrc
} from "./shared.js";

// Clickable hero behavior (open detected external video in new tab)
function bindHeroClickIfVideo(app) {
  const heroLink = app.querySelector(".post .hero-link");
  const heroImg  = app.querySelector(".post img.hero");
  if (!heroLink || !heroImg) return;
  const href = heroLink.getAttribute("href");
  if (!href) return;
  heroImg.classList.add("is-clickable");
  heroLink.addEventListener("click", (e) => {
    e.preventDefault();
    window.open(href, "_blank", "noopener");
  }, { passive: false });
}

export async function renderPost(id) {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `<div class="container"><p class="center">Loading…</p></div>`;

  let post;
  try {
    post = await fetchPost(id);
  } catch {
    app.innerHTML = `
      <div class="container">
        <div class="error-banner">
          <button class="close" aria-label="Dismiss">×</button>
          Failed to load post.
        </div>
      </div>`;
    return;
  }

  const author =
    post?._embedded?.author?.[0]?.name ||
    (Array.isArray(post?.authors) && post.authors[0]?.name) ||
    "";

  const media   = post?._embedded?.["wp:featuredmedia"]?.[0];
  const heroSrc = selectHeroSrc(media);

  // Decode, then sanitize content so inline images work
  const decoded     = decodeEntities(post?.content?.rendered || "");
  const contentHtml = sanitizeContent(decoded);

  // Try to detect a Facebook video URL for hero click-through
  const fbMatch  = decoded.match(/https?:\/\/(www\.)?facebook\.com\/[^"'\s)]+/i);
  const videoHref = fbMatch ? fbMatch[0] : "";

  const title    = decodeEntities(post?.title?.rendered || "");
  const dateText = ordinalDate(post?.date || new Date().toISOString());

  app.innerHTML = `
    <div class="container">
      <article class="post" data-id="${post.id}">
        <h1>${title}</h1>
        <div class="meta-author-date">
          ${author ? `<strong>${author}</strong>` : ``}
          <span class="date">${dateText}</span>
        </div>

        ${heroSrc ? `
          ${videoHref ? `
            <a class="hero-link" href="${videoHref}" target="_blank" rel="noopener">
              <img class="hero" src="${heroSrc}" alt="" />
            </a>
          ` : `
            <img class="hero" src="${heroSrc}" alt="" />
          `}
        ` : ``}

        <div class="content">${contentHtml}</div>

        <div style="margin-top:20px">
          <a class="btn" href="#/">Back to posts</a>
        </div>
      </article>
    </div>
  `;

  const contentRoot = app.querySelector(".post .content");
  if (contentRoot) {
    normalizeFirstParagraph(contentRoot);
    hardNukeIndent(contentRoot);
  }

  bindHeroClickIfVideo(app);

  document.addEventListener("click", function(e){
    const btn = e.target.closest('.error-banner .close'); if(btn) btn.closest('.error-banner')?.remove();
  }, { once: true, capture: true });
}
