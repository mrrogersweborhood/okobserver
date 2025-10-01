// detail.js — single post detail (bottom-only Back button, consistent dates)
// Strong first-paragraph normalization (kills indent from inline styles, NBSPs, blockquotes)

import { fetchPost } from "./api.js";
import { ordinalDate } from "./common.js";

/** Returns the first *visible-text* block inside root (skips empty wrappers). */
function firstContentBlock(root) {
  if (!root) return null;
  const candidates = root.querySelectorAll(
    'p, div, section, article, blockquote, ul, ol, h1, h2, h3, h4, h5, h6'
  );
  for (const el of candidates) {
    // Skip if it only contains images/figures or whitespace
    const text = (el.textContent || "").replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, "");
    if (text.length > 0) return el;
  }
  return null;
}

/** Strip leading spaces/NBSP/ZWSP from the first actual text node inside el. */
function stripLeadingWhitespace(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Find the first non-empty, visible text node
      return node.nodeValue && node.nodeValue.trim().length
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    }
  });
  const textNode = walker.nextNode();
  if (textNode) {
    // Remove NBSP (\u00A0), ZWSP (\u200B-\u200D), BOM (\uFEFF), regular spaces/tabs
    textNode.nodeValue = textNode.nodeValue.replace(/^[\u00A0\u200B\u200C\u200D\uFEFF \t]+/, "");
  }
}

/** Remove inline indent/margins on el and its ancestors up to .content */
function zeroInlineLeftOffsets(el, root) {
  let cur = el;
  while (cur && cur !== root && cur.nodeType === 1) {
    try {
      const styleAttr = cur.getAttribute && cur.getAttribute("style");
      if (styleAttr) {
        let s = styleAttr;
        s = s.replace(/text-indent\s*:\s*[^;]+;?/gi, "");
        s = s.replace(/margin-left\s*:\s*[^;]+;?/gi, "");
        s = s.replace(/padding-left\s*:\s*[^;]+;?/gi, "");
        s = s.replace(/border-left\s*:\s*[^;]+;?/gi, "");
        s = s.replace(/^\s*;\s*|\s*;\s*$/g, "");
        if (s.trim()) cur.setAttribute("style", s);
        else cur.removeAttribute("style");
      }
      // Also force computed style overrides (highest priority inline)
      cur.style.textIndent = "0";
      cur.style.marginLeft = "0";
      cur.style.paddingLeft = "0";
      // If a blockquote adds a left border/spacing, neutralize it (first block only)
      if (cur.tagName === "BLOCKQUOTE") {
        cur.style.borderLeft = "none";
      }
    } catch {}
    cur = cur.parentElement;
  }
}

/** If the very first block is a blockquote, try to unwrap it gently (optional). */
function gentlyUnwrapLeadingBlockquote(root, first) {
  if (!first || first.tagName !== "BLOCKQUOTE") return;
  // Only unwrap if simple structure: blockquote > single p/div with text
  const children = Array.from(first.children || []);
  if (children.length === 1 && /^(P|DIV)$/i.test(children[0].tagName)) {
    const p = children[0];
    // Move p before blockquote then remove blockquote
    first.parentNode.insertBefore(p, first);
    first.remove();
  } else {
    // If complex, just kill its left offsets
    zeroInlineLeftOffsets(first, root);
  }
}

/** Normalize the first content block to remove any leading indent from WP */
function normalizeFirstParagraph(root) {
  if (!root) return;
  const first = firstContentBlock(root);
  if (!first) return;
  gentlyUnwrapLeadingBlockquote(root, first);
  zeroInlineLeftOffsets(first, root);
  stripLeadingWhitespace(first);
}

export async function renderPost(id) {
  const container = document.getElementById("app");
  if (!container) return;
  container.innerHTML = '<p class="center">Loading…</p>';

  try {
    const post = await fetchPost(id);

    const author =
      post?._embedded?.author?.[0]?.name ||
      (Array.isArray(post?.authors) && post.authors[0]?.name) ||
      "";

    const dateStr = ordinalDate(new Date(post.date));

    const media = post?._embedded?.["wp:featuredmedia"]?.[0];
    const heroSrc = media?.source_url || "";
    const hero = heroSrc
      ? `<img class="hero" src="${heroSrc}" alt="" decoding="async" loading="eager" />`
      : "";

    // Only bottom Back button (per your spec)
    container.innerHTML = `
      <article class="post">
        <h1>${post.title.rendered || "Untitled"}</h1>
        <div class="meta-author-date">
          <span>${author ? `<strong>${author}</strong>` : ""}</span>
          <span class="date">${dateStr}</span>
        </div>
        ${hero}
        <div class="content">${post.content.rendered || ""}</div>
        <div style="margin-top:1.5rem">
          <a class="btn" href="#/">Back to posts</a>
        </div>
      </article>
    `;

    // Normalize the first visible block to remove any unwanted indentation
    const contentRoot = container.querySelector(".content");
    normalizeFirstParagraph(contentRoot);
  } catch (err) {
    console.error("[OkObserver] Failed to render post", err);
    container.innerHTML = `<p class="center">Error loading post.</p>`;
  }
}
