// PostDetail.js — OkObserver (v2025-10-24b)

import { el, decodeHTML, formatDate } from "./util.js?v=2025-10-24b";

/* ===========================
   EMBED HELPERS (Vimeo/YouTube)
   =========================== */

function vimeoIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "vimeo.com" || u.hostname.endsWith(".vimeo.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) return last;
    }
  } catch {}
  return null;
}

function ytIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return id;
      const m = u.pathname.match(/\/embed\/([^/?#]+)/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

function buildEmbedIframe({ type, id, title = "Embedded media" }) {
  if (!id) return "";
  if (type === "vimeo") {
    const src = `https://player.vimeo.com/video/${id}`;
    return `<div class="media-embed ratio-16x9">
      <iframe src="${src}" title="${title}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
    </div>`;
  }
  if (type === "youtube") {
    const src = `https://www.youtube.com/embed/${id}`;
    return `<div class="media-embed ratio-16x9">
      <iframe src="${src}" title="${title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>
    </div>`;
  }
  return "";
}

/**
 * Rewrites Vimeo/YouTube anchors/iframes inside HTML to proper embed players.
 */
function rewriteEmbeds(html) {
  if (!html) return html;
  const container = document.createElement("div");
  container.innerHTML = html;

  // Links → embeds
  container.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    const vid = vimeoIdFromUrl(href);
    const yid = ytIdFromUrl(href);
    if (vid) {
      a.outerHTML = buildEmbedIframe({ type: "vimeo", id: vid, title: a.textContent || "Vimeo video" });
    } else if (yid) {
      a.outerHTML = buildEmbedIframe({ type: "youtube", id: yid, title: a.textContent || "YouTube video" });
    }
  });

  // Iframes → proper players
  container.querySelectorAll("iframe[src]").forEach((ifr) => {
    const src = ifr.getAttribute("src") || "";
    const vid = vimeoIdFromUrl(src);
    const yid = ytIdFromUrl(src);
    if (vid) {
      ifr.outerHTML = buildEmbedIframe({ type: "vimeo", id: vid, title: ifr.getAttribute("title") || "Vimeo video" });
    } else if (yid) {
      ifr.outerHTML = buildEmbedIframe({ type: "youtube", id: yid, title: ifr.getAttribute("title") || "YouTube video" });
    }
  });

  return container.innerHTML;
}

/* ===========================
   RENDER DETAIL
   =========================== */

/**
 * Public API: renderPostDetail(rootEl, post)
 * Expects `post` from your API layer with fields:
 *   { title, date, content, author, categories, featured_media_url? }
 */
export function renderPostDetail(rootEl, post) {
  const target = rootEl || el("#app");
  if (!target) return;

  const title = decodeHTML(post?.title || "");
  const dateStr = formatDate(post?.date || "");
  const author = decodeHTML(post?.author || "");
  const featured = post?.featured_media_url ? `
    <figure class="post-hero">
      <img src="${post.featured_media_url}" alt="${title}">
    </figure>` : "";

  // Prepare body with embed fixes
  const fixedBody = rewriteEmbeds(decodeHTML(post?.content || ""));

  target.innerHTML = `
    <article class="post-detail">
      <p><a class="btn btn-primary back" href="#/" data-link>Back to Posts</a></p>

      ${featured}

      <header class="post-header">
        <h1 class="post-title">${title}</h1>
        <div class="byline">
          <span class="byline-author">${author || "Oklahoma Observer"}</span>
          <span class="divider">•</span>
          <time datetime="${post?.date || ""}">${dateStr}</time>
        </div>
      </header>

      <hr class="post-divider" />

      <section class="post-body">
        ${fixedBody}
      </section>

      <p><a class="btn btn-primary back" href="#/" data-link>Back to Posts</a></p>
    </article>
  `;
}

export default { renderPostDetail };
