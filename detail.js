// detail.js — post detail view with hardened first-paragraph de-indent
// and robust inline-image preprocessing (lazy placeholders + srcset + relative URLs)

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

// ----- First paragraph normalization (indent fixes) -----
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

// ----- Inline image preprocessing (before render) -----
const WP_BASE = "https://okobserver.org";

function isPlaceholderSrc(u) {
  if (!u) return true;
  if (/^data:image\/(gif|svg)/i.test(u)) return true; // typical lazy placeholders
  if (/blank|spacer|pixel|transparent/i.test(u)) return true;
  return false;
}

function absolutize(url) {
  if (!url) return url;
  if (url.startsWith("//")) return location.protocol + url;
  if (url.startsWith("/")) return WP_BASE + url;
  return url;
}

function fixSrcset(srcset) {
  if (!srcset) return srcset;
  return srcset
    .split(",")
    .map(part => {
      const bits = part.trim().split(/\s+/);
      if (!bits.length) return "";
      bits[0] = absolutize(bits[0]);
      return bits.filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

function prepareContentHTML(html) {
  const wrap = document.createElement("div");
  wrap.innerHTML = html || "";

  const imgs = wrap.querySelectorAll("img");
  imgs.forEach(img => {
    // gather candidates from data- attrs
    const candidates = [
      img.getAttribute("data-full"),
      img.getAttribute("data-original"),
      img.getAttribute("data-src"),
      img.getAttribute("data-lazy-src"),
      img.dataset ? (img.dataset.full || img.dataset.original || img.dataset.src || img.dataset.lazySrc) : ""
    ].filter(Boolean);

    // current sources
    let src = img.getAttribute("src") || "";
    let srcset = img.getAttribute("srcset") || "";

    // If src looks like a placeholder or empty, prefer candidates
    if (isPlaceholderSrc(src) && candidates.length) {
      src = candidates[0];
    }

    // If still placeholder, try largest from srcset
    if (isPlaceholderSrc(src) && srcset) {
      const urls = srcset.split(",").map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
      if (urls.length) src = urls[urls.length - 1];
    }

    // If after all this we still don't have something real, drop the img to avoid blank bars
    if (!src || isPlaceholderSrc(src)) { img.remove(); return; }

    // Absolutize src and srcset URLs
    src = absolutize(src);
    srcset = fixSrcset(srcset);

    img.setAttribute("src", src);
    if (srcset) img.setAttribute("srcset", srcset); else img.removeAttribute("srcset");

    // Clean size attributes & inline styles that force tiny dims
    img.removeAttribute("width");
    img.removeAttribute("height");
    const st = img.getAttribute("style") || "";
    if (st) {
      const cleaned = st
        .replace(/(?:^|;)\s*width\s*:\s*[^;]+;?/gi, "")
        .replace(/(?:^|;)\s*height\s*:\s*[^;]+;?/gi, "");
      if (cleaned.trim()) img.setAttribute("style", cleaned); else img.removeAttribute("style");
    }

    // Ensure consistent layout sizing
    img.classList.add("inline-img");

    // If wrapped by <a>, make sure it can expand
    const p = img.parentElement;
    if (p && p.tagName === "A") p.style.display = "block";
  });

  // Normalize WP caption containers
  wrap.querySelectorAll("figure, .wp-caption").forEach(box => {
    box.style.maxWidth = "100%";
  });

  return wrap.innerHTML;
}

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

  const media = post?._embedded?.["wp:featuredmedia"]?.[0];
  const heroSrc =
    media?.media_details?.sizes?.large?.source_url ||
    media?.media_details?.sizes?.medium_large?.source_url ||
    media?.source_url ||
    "";

  // Decode, then preprocess content so inline images work
  const decoded = decodeEntities(post?.content?.rendered || "");
  const contentHtml = prepareContentHTML(decoded);

  // Try to detect a Facebook video URL for hero click-through
  const fbMatch = decoded.match(/https?:\/\/(www\.)?facebook\.com\/[^"'\s)]+/i);
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
  }

  bindHeroClickIfVideo(app);

  document.addEventListener("click", function(e){
    const btn = e.target.closest('.error-banner .close'); if(btn) btn.closest('.error-banner')?.remove();
  }, { once: true, capture: true });
}
