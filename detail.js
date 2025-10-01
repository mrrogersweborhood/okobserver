// detail.js — single post detail (bottom-only Back button, consistent dates)
// Normalizes first paragraph to remove stray indents/nbsp coming from WP.

import { fetchPost } from "./api.js";
import { ordinalDate } from "./common.js"; // your existing helper

// Remove stray indentation on first visible block within .content
function normalizeFirstParagraph(root) {
  if (!root) return;
  // Find the first real block element inside .content
  const first = root.querySelector(
    'p, div, section, article, blockquote, ul, ol, h1, h2, h3, h4, h5, h6'
  );
  if (!first) return;

  try {
    // Kill any inline text-indent coming from WP editors/themes
    first.style.textIndent = "0";
    first.style.marginLeft = "0";
    first.style.paddingLeft = "0";

    // Also remove inline text-indent if set directly as an attribute (rare)
    if (first.hasAttribute("style")) {
      const s = first.getAttribute("style") || "";
      // Remove any text-indent: ...; occurrences
      const cleaned = s.replace(/text-indent\s*:\s*[^;]+;?/gi, "").replace(/^\s*;\s*|\s*;\s*$/g, "");
      first.setAttribute("style", cleaned);
    }

    // Strip leading NBSP/ZWSP and regular spaces from the first text node
    const walker = document.createTreeWalker(first, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // only consider visible, non-empty text nodes
        return node.nodeValue && node.nodeValue.trim().length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const textNode = walker.nextNode();
    if (textNode) {
      // Remove common problematic leading chars: NBSP, ZWSP, normal spaces/tabs
      textNode.nodeValue = textNode.nodeValue.replace(/^[\u00A0\u200B\u200C\u200D\uFEFF \t]+/, "");
    }
  } catch {}
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

    // Only bottom Back button (per your requirement)
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

    // Normalize first paragraph indentation/nbsp after content is in the DOM
    const contentRoot = container.querySelector(".content");
    normalizeFirstParagraph(contentRoot);
  } catch (err) {
    console.error("[OkObserver] Failed to render post", err);
    container.innerHTML = `<p class="center">Error loading post.</p>`;
  }
}
