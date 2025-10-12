// detail.v263.js — OkObserver v2.6.4
// Handles displaying a single post (article or video)

import { fetchWithRetry } from "./core-fixed.js?v=263";

export default async function renderPost(app, id) {
  try {
    app.innerHTML = `
      <div class="loading" style="text-align:center; margin:2em;">
        Loading...
      </div>
    `;

    const apiBase =
      window.OKO_API_BASE ||
      "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";

    const url = `${apiBase}/posts/${id}?_embed`;
    console.log("[Post fetch]", url);

    const post = await fetchWithRetry(url);
    if (!post || !post.title) throw new Error("Post not found");

    const title = post.title.rendered || "Untitled";
    const content = post.content?.rendered || "";
    const date = new Date(post.date).toLocaleDateString();
    const author =
      post._embedded?.author?.[0]?.name || "Oklahoma Observer";

    // Featured image (poster)
    let featuredHTML = "";
    if (post._embedded && post._embedded["wp:featuredmedia"]) {
      const media = post._embedded["wp:featuredmedia"][0];
      const src = media?.source_url;
      if (src) {
        featuredHTML = `
          <div class="featured-wrapper">
            <img class="featured-image" src="${src}" alt="${title}" loading="lazy" />
          </div>
        `;
      }
    }

    // Fix for empty video poster / iframe embeds
    const hasVideo =
      content.includes("<iframe") ||
      content.includes("<video") ||
      content.includes("youtube.com");

    const cleanContent = content
      .replace(/<p>\s*<\/p>/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    app.innerHTML = `
      <article class="post-detail">
        <a href="#/" class="back-link">← Back</a>
        <h1 class="post-title">${title}</h1>
        <p class="post-meta">
          By <span class="post-author">${author}</span> —
          <time>${date}</time>
        </p>

        ${
          hasVideo
            ? `<div class="video-container">${cleanContent}</div>`
            : featuredHTML
        }

        <div class="post-content">
          ${
            hasVideo
              ? ""
              : cleanContent
          }
        </div>
      </article>
    `;

    // Style adjustments to fix white space and responsive video
    const style = document.createElement("style");
    style.textContent = `
      .post-detail {
        max-width: 800px;
        margin: 2em auto;
        padding: 0 1em;
        line-height: 1.6;
      }
      .post-detail h1 {
        font-size: 1.8em;
        margin-bottom: 0.2em;
      }
      .post-meta {
        font-size: 0.9em;
        color: #666;
        margin-bottom: 1em;
      }
      .back-link {
        display: inline-block;
        margin-bottom: 1em;
        text-decoration: none;
        color: var(--brand, #1e90ff);
      }
      .featured-wrapper {
        display: flex;
        justify-content: center;
        margin: 1.5em 0;
      }
      .featured-image {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      }
      .video-container {
        position: relative;
        padding-bottom: 56.25%;
        height: 0;
        overflow: hidden;
        margin: 1.5em 0;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .video-container iframe,
      .video-container video {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
      }
      .post-content {
        margin-top: 1.5em;
        word-wrap: break-word;
      }
      .post-content img {
        max-width: 100%;
        border-radius: 8px;
      }
    `;
    document.head.appendChild(style);
  } catch (err) {
    console.error("[Post render error]", err);
    app.innerHTML = `
      <p style="color:red; text-align:center; margin-top:2em;">
        Page error: ${err.message}
      </p>
    `;
  }
}
