// shared.js — consolidated utilities + one-pass content sanitizer
// Safe to import in both home.js and detail.js

/* =========================
   Constants / Configuration
   ========================= */
export const APP_VERSION = "v2.3.0-utils-merge";

// WordPress site root (used to absolutize inline <img> paths in content)
export const WP_SITE = "https://okobserver.org";

/* ===============
   General helpers
   =============== */
export function decodeEntities(html = "") {
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

export function ordinalDate(dateISO) {
  const d = new Date(dateISO);
  const day = d.getDate();
  const ord =
    day % 10 === 1 && day !== 11 ? "st" :
    day % 10 === 2 && day !== 12 ? "nd" :
    day % 10 === 3 && day !== 13 ? "rd" : "th";
  return d.toLocaleString(undefined, { month: "long" }) + ` ${day}${ord}, ${d.getFullYear()}`;
}

// Absolute URL helpers for content assets
export function absolutize(url) {
  if (!url) return url;
  if (url.startsWith("//")) return location.protocol + url;
  if (url.startsWith("/"))  return WP_SITE + url;
  return url;
}

export function fixSrcset(srcset) {
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

export function isPlaceholderSrc(u) {
  if (!u) return true;
  if (/^data:image\/(gif|svg)/i.test(u)) return true; // lazy pixels
  if (/blank|spacer|pixel|transparent/i.test(u)) return true;
  return false;
}

/* ==========================
   First-paragraph normalization
   ========================== */
const BLOCK_TAG = /^(p|div|section|article|blockquote|figure)$/i;

export function findFirstTextBlock(root) {
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

export function stripIndentStylesInline(el) {
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

export function stripLeadingFillersFromHTML(html = "") {
  return html
    .replace(/^(\s*<br\s*\/?>)+/i, "")
    .replace(/^(\s*<(?:span|em|strong|i|b)[^>]*>(?:\s|&nbsp;|&ensp;|&emsp;|<br\s*\/?>)*<\/(?:span|em|strong|i|b)>\s*)+/i, "")
    .replace(/^([\u00A0\u2000-\u200A\u202F\u205F\u3000]|&nbsp;|&ensp;|&emsp;|\s)+/i, "");
}

export function normalizeFirstParagraph(root) {
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

export function hardNukeIndent(root) {
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

/* ==========================
   One-pass content sanitizer
   ========================== */
/**
 * sanitizeContent(html)
 * - Decodes entities
 * - Fixes inline <img>:
 *    • promotes lazy sources (data-full/data-original/data-src/data-lazy-src/srcset)
 *    • absolutizes src & srcset
 *    • strips width/height attrs and inline size styles
 *    • adds "inline-img" class
 *    • drops true placeholders to avoid gaps
 * - Normalizes figure/wp-caption widths
 * - Returns sanitized HTML string
 */
export function sanitizeContent(rawHTML = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = decodeEntities(rawHTML);

  const imgs = wrap.querySelectorAll("img");
  imgs.forEach(img => {
    const candidates = [
      img.getAttribute("data-full"),
      img.getAttribute("data-original"),
      img.getAttribute("data-src"),
      img.getAttribute("data-lazy-src"),
      img.dataset ? (img.dataset.full || img.dataset.original || img.dataset.src || img.dataset.lazySrc) : ""
    ].filter(Boolean);

    let src    = img.getAttribute("src") || "";
    let srcset = img.getAttribute("srcset") || "";

    if (isPlaceholderSrc(src) && candidates.length) {
      src = candidates[0];
    }
    if (isPlaceholderSrc(src) && srcset) {
      const urls = srcset.split(",").map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
      if (urls.length) src = urls[urls.length - 1];
    }

    if (!src || isPlaceholderSrc(src)) { img.remove(); return; }

    src    = absolutize(src);
    srcset = fixSrcset(srcset);

    img.setAttribute("src", src);
    if (srcset) img.setAttribute("srcset", srcset); else img.removeAttribute("srcset");

    img.removeAttribute("width");
    img.removeAttribute("height");
    const st = img.getAttribute("style") || "";
    if (st) {
      const cleaned = st
        .replace(/(?:^|;)\s*width\s*:\s*[^;]+;?/gi, "")
        .replace(/(?:^|;)\s*height\s*:\s*[^;]+;?/gi, "");
      if (cleaned.trim()) img.setAttribute("style", cleaned);
      else img.removeAttribute("style");
    }

    img.classList.add("inline-img");

    const p = img.parentElement;
    if (p && p.tagName === "A") p.style.display = "block";
  });

  wrap.querySelectorAll("figure, .wp-caption").forEach(box => {
    box.style.maxWidth = "100%";
  });

  return wrap.innerHTML;
}

/* ==========================
   Media helpers
   ========================== */
export function selectHeroSrc(media) {
  if (!media) return "";
  return (
    media?.media_details?.sizes?.large?.source_url ||
    media?.media_details?.sizes?.medium_large?.source_url ||
    media?.source_url ||
    ""
  );
}
