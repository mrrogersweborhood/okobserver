// detail.js — post detail view with single-embed rendering + inline URL fix

import { fetchPostById } from "./api.js";
import { decodeEntities, ordinalDate } from "./shared.js";

// Fix double-encoded URLs like "https%3A%2F%2Fsubstack..."
function maybeDecodeOnce(u) {
  if (typeof u !== "string" || !u.includes("%2F")) return u;
  try {
    // decode only once; if it’s already decoded this won’t run
    const decoded = decodeURIComponent(u);
    // basic safety: only allow http(s)
    if (/^https?:\/\//i.test(decoded)) return decoded;
  } catch {}
  return u;
}

function sanitizeInlineMedia(root) {
  // Decode once for common attributes that carry URLs
  root.querySelectorAll("a[href], img[src], source[src], video[src], iframe[src]").forEach(el => {
    ["href","src","data-src","poster"].forEach(attr => {
      if (el.hasAttribute(attr)) {
        const val = el.getAttribute(attr);
        const fixed = maybeDecodeOnce(val);
        if (fixed !== val) el.setAttribute(attr, fixed);
      }
    });
  });

  // Prevent iframes from overflowing and keep them responsive
  root.querySelectorAll("iframe").forEach(ifr => {
    ifr.setAttribute("loading", "lazy");
    ifr.style.maxWidth = "100%";
    ifr.style.width = "100%";
    ifr.style.aspectRatio = ifr.style.aspectRatio || "16/9";
    ifr.style.height = "auto";
  });

  // Videos: lazy + responsive
  root.querySelectorAll("video").forEach(v => {
    v.setAttribute("preload", "metadata");
    v.setAttribute("controls", "controls");
    v.style.maxWidth = "100%";
    v.style.width = "100%";
    v.style.height = "auto";
  });

  // Images: responsive
  root.querySelectorAll("img").forEach(img => {
    img.loading = "lazy";
    img.decoding = "async";
    img.style.maxWidth = "100%";
    img.style.height = "auto";
  });
}

function selectHero(post) {
  const media = post?._embedded?.["wp:featuredmedia"]?.[0];
  const sizes = media?.media_details?.sizes || {};
  return (
    sizes?.large?.source_url ||
    sizes?.medium_large?.source_url ||
    media?.source_url ||
    ""
  );
}

export async function renderPost(id) {
  const app = document.getElementById("app");
  if (!app) return;

  // container
  const container = document.createElement("div");
  container.className = "container post";
  app.innerHTML = "";
  app.appendChild(container);

  // Back-to-posts button should appear **after** content is ready (avoid flashes)
  const addBackButton = () => {
    const back = document.createElement("a");
    back.className = "btn";
    back.href = "#/";
    back.textContent = "Back to posts";
    container.appendChild(back);
  };

  try {
    const post = await fetchPostById(id); // expects _embed=1 in api.js
    const title = decodeEntities(post?.title?.rendered || "");
    const dateText = ordinalDate(post?.date || new Date().toISOString());
    const author =
      post?._embedded?.author?.[0]?.name ||
      (Array.isArray(post?.authors) && post.authors[0]?.name) ||
      "";
    const hero = selectHero(post);

    // title
    const h1 = document.createElement("h1");
    h1.textContent = title;
    container.appendChild(h1);

    // meta
    const meta = document.createElement("div");
    meta.className = "meta-author-date";
    meta.innerHTML = `${author ? `<strong>${author}</strong>` : ""} <span class="date">${dateText}</span>`;
    container.appendChild(meta);

    // hero if present
    if (hero) {
      const img = document.createElement("img");
      img.className = "hero hoverable";
      img.src = hero;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      container.appendChild(img);
    }

    // content
    const content = document.createElement("div");
    content.className = "content";
    content.innerHTML = post?.content?.rendered || "";
    sanitizeInlineMedia(content);
    container.appendChild(content);

    // back to posts (bottom only, after content)
    addBackButton();
  } catch (e) {
    container.innerHTML = `
      <div class="error-banner">
        <button class="close" aria-label="Dismiss">×</button>
        Failed to load post: ${e?.message || e}
      </div>`;
  }
}
