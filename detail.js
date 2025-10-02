// detail.js — post detail view with hardened first-paragraph de-indent (JS + CSS guards)

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

// Block detection: include typical containers that may hold the first text
const BLOCK_TAG = /^(p|div|section|article|blockquote|figure)$/i;

// Return the first block-like element that actually contains non-empty text
function findFirstTextBlock(root) {
  if (!root) return null;
  const q = Array.from(root.children || []);
  while (q.length) {
    const el = q.shift();
    if (!el) continue;

    if (BLOCK_TAG.test(el.tagName)) {
      // Text with whitespace & NBSP trimmed
      const text = (el.textContent || "")
        .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
        .replace(/^\s+|\s+$/g, "");
      if (text.length > 0) return el;
    }
    // Continue BFS
    q.push(...(el.children || []));
  }
  return null;
}

// Strip common inline indent styles from an element's style attribute
function stripIndentStylesInline(el) {
  if (!el) return;
  const styleAttr = el.getAttribute?.("style");
  if (styleAttr) {
    const cleaned = styleAttr
      // remove text-indent
      .replace(/text-indent\s*:\s*[^;]+;?/gi, "")
      // remove left margins/padding often used to fake indents
      .replace(/margin-left\s*:\s*[^;]+;?/gi, "")
      .replace(/padding-left\s*:\s*[^;]+;?/gi, "")
      // neutralize white-space that preserves leading spaces
      .replace(/white-space\s*:\s*[^;]+;?/gi, "");
    if (cleaned.trim()) el.setAttribute("style", cleaned);
    else el.removeAttribute("style");
  }
  if (el.style) {
    // Also clear via style API to win over specificity
    try {
      el.style.textIndent = "0";
      el.style.marginLeft = "";
      el.style.paddingLeft = "";
      if (el.style.whiteSpace) el.style.whiteSpace = "";
    } catch {}
  }
}

// Remove leading <br> and leading space entities (&nbsp;/&ensp;/&emsp;/unicode spaces)
function stripLeadingFillersFromHTML(html) {
  if (!html) return html;
  return html
    // remove leading <br> tags
    .replace(/^(\s*<br\s*\/?>)+/i, "")
    // unwrap empty tags that only contain breaks/spaces at the start (e.g., <span>&nbsp;</span>)
    .replace(/^(\s*<(?:span|em|strong|i|b)[^>]*>(?:\s|&nbsp;|&ensp;|&emsp;|<br\s*\/?>)*<\/(?:span|em|strong|i|b)>\s*)+/i, "")
    // remove leading NBSP/ENSP/EMSP and other unicode wide spaces, plus normal spaces/tabs
    .replace(/^([\u00A0\u2000-\u200A\u202F\u205F\u3000]|&nbsp;|&ensp;|&emsp;|\s)+/i, "");
}

// Normalize first paragraph/first text block
function normalizeFirstParagraph(root) {
  const first = findFirstTextBlock(root);
  if (!first) return;

  // Clean the block itself
  stripIndentStylesInline(first);
  first.innerHTML = stripLeadingFillersFromHTML(first.innerHTML);

  // Clean first-level children (they often carry span/inline styles that indent)
  const kids = Array.from(first.children || []);
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    stripIndentStylesInline(child);
    // Only strip leading fillers from the very first child that contributes content
    if (i === 0) {
      child.innerHTML = stripLeadingFillersFromHTML(child.innerHTML);
    }
  }

  // Deep sweep: any descendant explicitly setting text-indent/margins gets neutralized
  first.querySelectorAll("*[style]").forEach((el) => stripIndentStylesInline(el));
}

// Final hard guard: apply !important zeroing to defeat stubborn inline styles
function hardNukeIndent(root) {
  const first = findFirstTextBlock(root);
  if (!first) return;

  // Clean leading fillers again in case inline tags regened content
  first.innerHTML = stripLeadingFillersFromHTML(first.innerHTML);

  // Force zero with !important
  try {
    first.style.setProperty("text-indent", "0", "important");
    first.style.setProperty("margin-left", "0", "important");
    first.style.setProperty("padding-left", "0", "important");
    first.style.setProperty("white-space", "normal", "important");
  } catch {}

  // Also force the very first inline child if present
  const firstInline = first.firstElementChild;
  if (firstInline) {
    try {
      firstInline.style.setProperty("text-indent", "0", "important");
      firstInline.style.setProperty("margin-left", "0", "important");
      firstInline.style.setProperty("padding-left", "0", "important");
      firstInline.style.setProperty("white-space", "normal", "important");
    } catch {}
  }
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

  // Normalize first paragraph indentation reliably (covers inline styles + entities)
  const contentRoot = app.querySelector(".post .content");
  if (contentRoot) {
    normalizeFirstParagraph(contentRoot);
    hardNukeIndent(contentRoot); // final !important override
  }

  // Enhance hero if we detected a video URL (hover/click handled safely)
  bindHeroClickIfVideo(app, post);

  // Close error banners
  document.addEventListener("click", function(e){
    const btn = e.target.closest('.error-banner .close'); if(btn) btn.closest('.error-banner')?.remove();
  }, { once: true, capture: true });
}
