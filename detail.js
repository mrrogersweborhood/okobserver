// detail.js — single post detail (bottom-only Back button, consistent dates)
// Strong first-paragraph normalization (handles nested spans, NBSP/ZWSP, inline styles, leading blockquotes)

import { fetchPost } from "./api.js";
import { ordinalDate } from "./common.js";

/** Depth-first iterator over nodes */
function* walkNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL, null);
  let n = walker.currentNode;
  while (n) {
    yield n;
    n = walker.nextNode();
  }
}

/** Remove *all* leading whitespace-like chars from the first text run in the subtree */
function stripLeadingWhitespaceDeep(root) {
  const WS_RE = /^[\u00A0\u200B\u200C\u200D\uFEFF \t\r\n]+/; // NBSP, ZW* & spaces/tabs/newlines
  for (const n of walkNodes(root)) {
    if (n.nodeType === Node.TEXT_NODE && n.nodeValue) {
      const before = n.nodeValue;
      const after = before.replace(WS_RE, "");
      if (after !== before) {
        n.nodeValue = after;
        if (after.length > 0) return; // done once we hit the first non-empty text
        // If emptied, keep going to next text node until we finally meet real content
      } else if (before.trim().length > 0) {
        // first non-whitespace text encountered
        return;
      }
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      // If this element is entirely empty or only whitespace, continue; otherwise keep walking
      // No-op here; walking handles it
    }
  }
}

/** Best-effort: find the first *real* content block (has meaningful text somewhere inside) */
function firstContentBlock(root) {
  if (!root) return null;
  const candidates = root.querySelectorAll('p, div, section, article, blockquote, ul, ol');
  for (const el of candidates) {
    const text = (el.textContent || "").replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, "");
    if (text.length > 0) return el;
  }
  return null;
}

/** Zero out left offsets (indent/margins/padding/border-left) on el and ancestors up to root */
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
      cur.style.textIndent = "0";
      cur.style.marginLeft = "0";
      cur.style.paddingLeft = "0";
      if (cur.tagName === "BLOCKQUOTE") cur.style.borderLeft = "none";
    } catch {}
    cur = cur.parentElement;
  }
}

/** If the first block is a simple blockquote>P|DIV, unwrap it; else just neutralize its left offsets */
function gentlyUnwrapLeadingBlockquote(root, first) {
  if (!first || first.tagName !== "BLOCKQUOTE") return;
  const kids = Array.from(first.children || []);
  if (kids.length === 1 && /^(P|DIV)$/i.test(kids[0].tagName)) {
    const inner = kids[0];
    first.parentNode.insertBefore(inner, first);
    first.remove();
  } else {
    zeroInlineLeftOffsets(first, root);
  }
}

/** Normalize any left-pushed indent coming from WP */
function normalizeFirstParagraph(root) {
  if (!root) return;
  // Remove pure leading whitespace across nested spans/text nodes
  stripLeadingWhitespaceDeep(root);

  // Now find the first real block
  const first = firstContentBlock(root);
  if (!first) return;

  // If it begins with a blockquote wrapper, unwrap/neutralize it
  gentlyUnwrapLeadingBlockquote(root, first);

  // Remove inline left-offsets on the first block and its wrapper chain
  zeroInlineLeftOffsets(first, root);

  // Also scrub the *very first inline* inside that block for stray inline text-indent
  const firstInline = first.querySelector("span, em, strong, a, i, b, u, small, sup, sub");
  if (firstInline) zeroInlineLeftOffsets(firstInline, root);

  // Finally, ensure the very first text run has no NBSP/ZWSP left
  stripLeadingWhitespaceDeep(first);
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

    // Normalize after content render
    const contentRoot = container.querySelector(".content");
    normalizeFirstParagraph(contentRoot);
  } catch (err) {
    console.error("[OkObserver] Failed to render post", err);
    container.innerHTML = `<p class="center">Error loading post.</p>`;
  }
}
