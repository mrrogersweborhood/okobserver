// detail.js — post detail view with robust first-paragraph normalization

import { fetchPost } from "./api.js";
import { saveHomeSnapshot } from "./home.js";

// Utilities
function ordinalDate(dateISO) {
  const d = new Date(dateISO);
  const day = d.getDate();
  const ord =
    day % 10 === 1 && day !== 11 ? "st" :
    day % 10 === 2 && day !== 12 ? "nd" :
    day % 10 === 3 && day !== 13 ? "rd" : "th";
  return d.toLocaleString(undefined, { month: "long" }) + ` ${day}${ord}, ${d.getFullYear()}`;
}

function decodeEntities(html) {
  if (!html) return "";
  return String(html)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&hellip;|&#8230;/g, "…")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”");
}

// Find the first block-level element that actually contains text content
function findFirstTextBlock(root) {
  if (!root) return null;
  const isBlock = (el) => {
    const name = el?.nodeName?.toLowerCase();
    return !!name && /^(p|div|section|article|blockquote)$/.test(name);
  };
  // BFS through blocks until we see non-empty text
  const q = Array.from(root.children || []);
  while (q.length) {
    const el = q.shift();
    if (!el) continue;
    if (isBlock(el)) {
      // textContent stripped of whitespace/nbsp/br
      const text = el.textContent
        .replace(/\u00A0/g, " ")
        .replace(/^\s+|\s+$/g, "");
      if (text.length > 0) return el;
    }
    q.push(...(el.children || []));
  }
  return null;
}

// Remove inline indent styles and leading fillers (&nbsp;, NBSP, starting <br>)
function normalizeFirstParagraph(root) {
  const first = findFirstTextBlock(root);
  if (!first) return;

  // 1) Strip inline text-indent from style attribute (if present)
  const styleAttr = first.getAttribute("style");
  if (styleAttr && /text-indent/i.test(styleAttr)) {
    const cleaned = styleAttr.replace(/text-indent\s*:\s*[^;]+;?/gi, "");
    if (cleaned.trim()) first.setAttribute("style", cleaned);
    else first.removeAttribute("style");
  }
  // Also explicitly neutralize via style API (in case of specificity)
  if (first.style) {
    try {
      first.style.textIndent = "0";
      // Hard stop any left offsets that mimic indentation
      if (first.style.marginLeft) first.style.marginLeft = "";
      if (first.style.paddingLeft) first.style.paddingLeft = "";
    } catch {}
  }

  // 2) Remove leading fillers in the HTML: &nbsp;, NBSP, and stray <br> at the start
  // Do this carefully to avoid removing meaningful content.
  const html = first.innerHTML;
  if (html) {
    const cleaned = html
      // remove leading <br> tags (one or more)
      .replace(/^(\s*<br\s*\/?>)+/i, "")
      // remove leading nbsp characters/entities/spaces
      .replace(/^(\u00A0|&nbsp;|\s)+/i, "");
    if (cleaned !== html) first.innerHTML = cleaned;
  }

  // 3) Also sweep nested descendants inside the first block for explicit text-indent
  first.querySelectorAll("*[style]").forEach((el) => {
    const st = el.getAttribute("style");
    if (!st) return;
    if (/text-indent/i.test(st)) {
      const newSt = st.replace(/text-indent\s*:\s*[^;]+;?/gi, "");
      if (newSt.trim()) el.setAttribute("style", newSt);
      else el.removeAttribute("style");
    }
  });
}

// Clickable hero behavior: open external video links in new tab when hero is a video proxy
function bindHeroClickIfVideo(app, post) {
  const heroLink = app.querySelector(".post .hero-link");
  const heroImg  = app.querySelector(".post img.hero");
  if (!heroLink || !heroImg) return;
  const href = heroLink.getAttribute("href");
  if (!href) return;

  // Provide a hover affordance via CSS class
  heroImg.classList.add("is-clickable");
  heroLink.addEventListener("click", (e) => {
    // Always open in new tab
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
  } catch (e) {
    app.innerHTML = `
      <div class="container">
        <div class="error-banner">
          <button class="close" aria-label="Dismiss">×</button>
          Failed to load post.
        </div>
      </div>`;
    return;
  }

  // Extract author & media
  const author =
    post?._embedded?.author?.[0]?.name ||
    (Array.isArray(post?.authors) && post.authors[0]?.name) ||
    "";

  const media = post?._embedded?.["wp:featuredmedia"]?.[0];
  const heroSrc =
    media?.media_details?.sizes?.large?.source_url ||
    media?.media_details?.sizes?.medium_large?.source_url ||
    media?.source_url ||
    "";

  // Detect a Facebook video link in content for hero click-through
  const contentHtml = decodeEntities(post?.content?.rendered || "");
  const fbMatch = contentHtml.match(/https?:\/\/(www\.)?facebook\.com\/[^"'\s)]+/i);
  const videoHref = fbMatch ? fbMatch[0] : "";

  const title = decodeEntities(post?.title?.rendered || "");
  const dateText = ordinalDate(post?.date || new Date().toISOString());

  // Build detail shell
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

  // Normalize first paragraph indentation reliably
  const contentRoot = app.querySelector(".post .content");
  if (contentRoot) normalizeFirstParagraph(contentRoot);

  // Enhance hero if we detected a video URL (hover/click handled safely)
  bindHeroClickIfVideo(app, post);

  // Close error banners
  document.addEventListener("click", function(e){
    const btn = e.target.closest('.error-banner .close'); if(btn) btn.closest('.error-banner')?.remove();
  }, { once: true, capture: true });
}
