// detail.js — post detail view with hardened first-paragraph de-indent
// and inline-image fixes (handles lazy placeholders, removes bad width/height)

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

// Block detection for first paragraph
const BLOCK_TAG = /^(p|div|section|article|blockquote|figure)$/i;

function findFirstTextBlock(root) {
  if (!root) return null;
  const q = Array.from(root.children || []);
  while (q.length) {
    const el = q.shift();
    if (!el) continue;
    if (BLOCK_TAG.test(el.tagName)) {
      const text = (el.textContent || "")
        .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
        .replace(/^\s+|\s+$/g, "");
      if (text.length > 0) return el;
    }
    q.push(...(el.children || []));
  }
  return null;
}

function stripIndentStylesInline(el) {
  if (!el) return;
  const styleAttr = el.getAttribute?.("style");
  if (styleAttr) {
    const cleaned = styleAttr
      .replace(/text-indent\s*:\s*[^;]+;?/gi, "")
      .replace(/margin-left\s*:\s*[^;]+;?/gi, "")
      .replace(/padding-left\s*:\s*[^;]+;?/gi, "")
      .replace(/white-space\s*:\s*[^;]+;?/gi, "");
    if (cleaned.trim()) el.setAttribute("style", cleaned);
    else el.removeAttribute("style");
  }
  if (el.style) {
    try {
      el.style.textIndent = "0";
      el.style.marginLeft = "";
      el.style.paddingLeft = "";
      if (el.style.whiteSpace) el.style.whiteSpace = "";
    } catch {}
  }
}

function stripLeadingFillersFromHTML(html) {
  if (!html) return html;
  return html
    .replace(/^(\s*<br\s*\/?>)+/i, "")
    .replace(/^(\s*<(?:span|em|strong|i|b)[^>]*>(?:\s|&nbsp;|&ensp;|&emsp;|<br\s*\/?>)*<\/(?:span|em|strong|i|b)>\s*)+/i, "")
    .replace(/^([\u00A0\u2000-\u200A\u202F\u205F\u3000]|&nbsp;|&ensp;|&emsp;|\s)+/i, "");
}

function normalizeFirstParagraph(root) {
  const first = findFirstTextBlock(root);
  if (!first) return;
  stripIndentStylesInline(first);
  first.innerHTML = stripLeadingFillersFromHTML(first.innerHTML);
  const kids = Array.from(first.children || []);
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    stripIndentStylesInline(child);
    if (i === 0) child.innerHTML = stripLeadingFillersFromHTML(child.innerHTML);
  }
  first.querySelectorAll("*[style]").forEach((el) => stripIndentStylesInline(el));
}

function hardNukeIndent(root) {
  const first = findFirstTextBlock(root);
  if (!first) return;
  first.innerHTML = stripLeadingFillersFromHTML(first.innerHTML);
  try {
    first.style.setProperty("text-indent", "0", "important");
    first.style.setProperty("margin-left", "0", "important");
    first.style.setProperty("padding-left", "0", "important");
    first.style.setProperty("white-space", "normal", "important");
  } catch {}
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

/* ===== Inline image normalization (fixes 1px/skinny images) ===== */
function fixInlineImages(root) {
  if (!root) return;
  const imgs = root.querySelectorAll("img");
  imgs.forEach(img => {
    // Lazyload placeholders → swap in real source if present
    const d = img.dataset || {};
    const candidates = [d.src, d.lazySrc, d.original, d.full, d.large, d.medium, img.getAttribute("data-src"), img.getAttribute("data-lazy-src"), img.getAttribute("data-original"), img.getAttribute("data-full")].filter(Boolean);
    if (candidates.length) {
      const current = img.getAttribute("src") || "";
      // If current is a pixel/blank, upgrade
      if (!current || /data:image\/gif|data:image\/svg|blank\.gif/i.test(current)) {
        img.setAttribute("src", candidates[0]);
      }
    }

    // Neutralize HTML width/height attributes & inline size styles
    if (img.hasAttribute("width")) img.removeAttribute("width");
    if (img.hasAttribute("height")) img.removeAttribute("height");
    if (img.style) {
      img.style.width = "auto";
      img.style.height = "auto";
      img.style.maxWidth = "100%";
      // If something forced tiny height, smash it:
      img.style.setProperty("height", "auto", "important");
      img.style.setProperty("max-width", "100%", "important");
    }

    // If wrapped in a link and treated inline, make sure it displays as block
    const parent = img.parentElement;
    if (parent && parent.tagName === "A") {
      parent.style.display = "block";
    }
  });
}

// Clickable hero behavior
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

  const media = post?._embedded?.["wp:featuredmedia"]?.[0];
  const heroSrc =
    media?.media_details?.sizes?.large?.source_url ||
    media?.media_details?.sizes?.medium_large?.source_url ||
    media?.source_url ||
    "";

  const contentHtml = decodeEntities(post?.content?.rendered || "");
  const fbMatch = contentHtml.match(/https?:\/\/(www\.)?facebook\.com\/[^"'\s)]+/i);
  const videoHref = fbMatch ? fbMatch[0] : "";

  const title = decodeEntities(post?.title?.rendered || "");
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
    fixInlineImages(contentRoot);           // ← NEW: fix inline images
  }

  bindHeroClickIfVideo(app);

  document.addEventListener("click", function(e){
    const btn = e.target.closest('.error-banner .close'); if(btn) btn.closest('.error-banner')?.remove();
  }, { once: true, capture: true });
}
