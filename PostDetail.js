// PostDetail.js — Post detail view (v2025-10-24a)
// Renders a single post (image or video), headline, byline, and article body.

import { fetchPost, extractMedia, detectProviderUrlFromPost } from "./api.js?v=2025-10-24a";
import { decodeHTML } from "./util.js?v=2025-10-24a";

/* ------------------------- helpers ------------------------- */

function backButton() {
  return `<a class="back" href="#/" data-link>Back to Posts</a>`;
}

function renderPoster(post) {
  // If it’s a known-video provider, embed responsive iframe
  const providerUrl = detectProviderUrlFromPost(post);
  if (providerUrl) {
    return `
      <div class="poster" style="margin-top:1rem;">
        <div class="embed-16x9">
          <iframe src="${providerUrl.replace(/&amp;/g, "&")}"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowfullscreen
                  loading="lazy"
                  referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
      </div>`;
  }

  // Otherwise, show featured image or first image in content
  const poster = extractMedia(post);
  if (poster) {
    return `
      <figure class="poster has-image" style="margin-top:1rem;">
        <img src="${poster}" alt="" loading="lazy" decoding="async" />
      </figure>`;
  }

  // Fallback (empty box)
  return `
    <div class="poster" style="margin-top:1rem;background:#f3f4f6;border-radius:16px;height:260px;"></div>`;
}

function byline(post) {
  const author = post?._embedded?.author?.[0]?.name || "Oklahoma Observer";
  const date = new Date(post?.date).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric"
  });
  return `<div class="byline">By ${author} — ${date}</div>`;
}

/* -------------------------- view --------------------------- */

export async function renderPostDetail(rootEl, id) {
  rootEl.innerHTML = `<div class="detail"><div style="padding:2rem 0;text-align:center;">Loading…</div></div>`;

  try {
    const post = await fetchPost(id);

    const title = decodeHTML(post?.title?.rendered || "Untitled");
    const content = String(post?.content?.rendered || "");

    rootEl.innerHTML = `
      <article class="detail">
        ${renderPoster(post)}
        <div style="margin-top:.75rem;">${backButton()}</div>

        <h1 class="headline">${title}</h1>
        ${byline(post)}

        <section class="content">
          <div class="article-body">${content}</div>
        </section>

        <div style="margin-top:1.25rem;">${backButton()}</div>
      </article>
    `;

    // Ensure any wide media inside content stays within bounds on mobile
    const imgs = rootEl.querySelectorAll(".article-body img, .article-body iframe, .article-body figure");
    imgs.forEach(el => {
      el.style.maxWidth = "100%";
      el.style.height = "auto";
    });

  } catch (err) {
    console.error("[PostDetail] failed:", err);
    rootEl.innerHTML = `
      <article class="detail">
        ${backButton()}
        <h1 class="headline">Unable to load post</h1>
        <p style="color:#b00020;">${decodeURI(err?.message || "Unknown error")}</p>
        ${backButton()}
      </article>
    `;
  }
}

export default { renderPostDetail };
