// detail.js — single-post view (one player max, FB fallback via clickable hero)

import {
  decodeEntities,
  ordinalDate,
  sanitizeContent,
  normalizeFirstParagraph,
  selectHeroSrc,
} from "./shared.js";
import { fetchPost } from "./api.js";

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : String(v));
  }
  kids.flat().forEach((k) => {
    if (k == null) return;
    if (typeof k === "string") n.appendChild(document.createTextNode(k));
    else n.appendChild(k);
  });
  return n;
}

// Detect a single embeddable iframe (YouTube, Vimeo, FB) inside provided HTML
function extractFirstIframe(html) {
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  const iframe = wrap.querySelector("iframe");
  return iframe ? iframe.outerHTML : "";
}

// Find a Facebook video URL inside content (used for fallback)
function findFacebookVideoURL(html) {
  const match = html.match(/https?:\/\/(?:www\.)?facebook\.com\/[^"'\s)]+/i);
  return match ? match[0] : "";
}

// Build the bottom-only Back button (cursor restoration handled by home.js)
function backButton() {
  return el(
    "div",
    { style: "margin: 16px 0 0" },
    el(
      "a",
      { href: "#/", class: "btn", "aria-label": "Back to posts" },
      "Back to posts"
    )
  );
}

export async function renderPost(id) {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `<p class="center">Loading…</p>`;

  try {
    const ctrl = new AbortController();
    const post = await fetchPost(id, ctrl.signal);

    const title = decodeEntities(post?.title?.rendered || "");
    const date = ordinalDate(post?.date || new Date().toISOString());
    const author =
      post?._embedded?.author?.[0]?.name ||
      (Array.isArray(post?.authors) && post.authors[0]?.name) ||
      "";

    // Create shell
    const container = el("div", { class: "container post" });
    const h1 = el("h1", {}, title);
    const meta = el(
      "div",
      { class: "meta-author-date" },
      author ? el("strong", {}, author) : "",
      el("span", { class: "date" }, date)
    );

    // Content preparation
    const raw = String(post?.content?.rendered || "");
    const cleanHTML = sanitizeContent(raw);
    const firstIframe = extractFirstIframe(cleanHTML);
    const fbURL = !firstIframe ? findFacebookVideoURL(cleanHTML) : "";

    // Hero: If we have an iframe, render exactly one player; otherwise try hero image.
    const heroHolder = el("div");
    if (firstIframe) {
      // One player only
      heroHolder.innerHTML = firstIframe;
      // optional: ensure it’s responsive
      heroHolder.querySelectorAll("iframe").forEach((f) => {
        f.setAttribute("width", "100%");
        f.setAttribute("height", "420");
        f.setAttribute("loading", "lazy");
      });
    } else {
      const heroSrc = selectHeroSrc(post);
      if (heroSrc) {
        // If we have a FB URL (or any external video URL) and no iframe, make hero clickable.
        const clickable = fbURL ? el("a", { href: fbURL, target: "_blank", rel: "noopener" }) : null;
        const img = el("img", {
          class: fbURL ? "hero hoverable" : "hero",
          src: heroSrc,
          alt: "",
          style: "display:block;max-height:420px;object-fit:cover;margin:16px 0;border-radius:10px;width:100%;"
        });
        if (clickable) {
          clickable.appendChild(img);
          heroHolder.appendChild(clickable);
        } else {
          heroHolder.appendChild(img);
        }
      }
    }

    // Body content (after hero). Normalize first paragraph indentation.
    const body = el("div", { class: "content" });
    body.innerHTML = cleanHTML;
    normalizeFirstParagraph(body);

    // Assemble (bottom-only Back button)
    container.appendChild(h1);
    container.appendChild(meta);
    if (heroHolder.childNodes.length) container.appendChild(heroHolder);
    container.appendChild(body);
    container.appendChild(backButton());

    app.innerHTML = "";
    app.appendChild(container);
  } catch (err) {
    console.error("[OkObserver] Post load failed:", err);
    app.innerHTML = `<div class="error-banner">Failed to load post. ${err.message || err}</div>`;
  }
}
