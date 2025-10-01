// detail.js — single post detail
// - Normalizes first paragraph (removes unwanted indent from WP inline styles, NBSP/ZWSP, leading blockquotes)
// - Makes existing iframes responsive by wrapping them in .embed
// - Converts bare YouTube/Vimeo/Facebook video links into responsive iframes
// - Shows only a bottom “Back to posts” button

import { fetchPost } from "./api.js";
import { ordinalDate } from "./common.js";

/* =========================
   First-paragraph normalizer
   ========================= */

/** Depth-first iterator */
function* walkNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL, null);
  let n = walker.currentNode;
  while (n) { yield n; n = walker.nextNode(); }
}

/** Remove leading NBSP/ZWSP/space across descendants until first real text */
function stripLeadingWhitespaceDeep(root) {
  const WS_RE = /^[\u00A0\u200B\u200C\u200D\uFEFF \t\r\n]+/;
  for (const n of walkNodes(root)) {
    if (n.nodeType === Node.TEXT_NODE && n.nodeValue) {
      const before = n.nodeValue;
      const after = before.replace(WS_RE, "");
      if (after !== before) {
        n.nodeValue = after;
        if (after.length > 0) return;   // done: hit first non-empty text
      } else if (before.trim().length > 0) {
        return; // encountered first non-whitespace text
      }
    }
  }
}

/** Find first real content block inside root (skips wrappers with no text) */
function firstContentBlock(root) {
  if (!root) return null;
  const nodes = root.querySelectorAll("p, div, section, article, blockquote, ul, ol");
  for (const el of nodes) {
    const txt = (el.textContent || "").replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, "");
    if (txt.length > 0) return el;
  }
  return null;
}

/** Zero left offsets on element and its ancestors up to root */
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
      // Inline override (wins over theme)
      cur.style.textIndent = "0";
      cur.style.marginLeft = "0";
      cur.style.paddingLeft = "0";
      if (cur.tagName === "BLOCKQUOTE") cur.style.borderLeft = "none";
    } catch {}
    cur = cur.parentElement;
  }
}

/** If first block is simple <blockquote><p|div>…</>, unwrap; else just neutralize */
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

/** Main normalization entry */
function normalizeFirstParagraph(root) {
  if (!root) return;

  // 1) Remove leading whitespace across descendants
  stripLeadingWhitespaceDeep(root);

  // 2) Find first real block
  const first = firstContentBlock(root);
  if (!first) return;

  // 3) Unwrap/neutralize leading blockquote wrapper
  gentlyUnwrapLeadingBlockquote(root, first);

  // 4) Kill left offsets on the first block and its wrapper chain
  zeroInlineLeftOffsets(first, root);

  // 5) Scrub first inline descendant (spans with inline text-indent etc.)
  const firstInline = first.querySelector("span, em, strong, a, i, b, u, small, sup, sub");
  if (firstInline) zeroInlineLeftOffsets(firstInline, root);

  // 6) Final pass: ensure first text run is clean
  stripLeadingWhitespaceDeep(first);
}

/* =========================
   oEmbed rescue (YouTube/Vimeo/Facebook)
   ========================= */

function toYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/watch")) return u.searchParams.get("v");
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
      const m = u.pathname.match(/\/embed\/([^/?#]+)/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

function toVimeoId(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("vimeo.com")) return null;
    const m = u.pathname.match(/^\/(\d+)(?:$|[/?#])/);
    return m ? m[1] : null;
  } catch {}
  return null;
}

/** Detect a Facebook *video* URL; return canonical plugin src if so */
function toFacebookVideoPluginSrc(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("facebook.com")) return null;
    // Accept common forms:
    // https://www.facebook.com/{page}/videos/{id}
    // https://www.facebook.com/watch/?v={id}
    const isWatch = u.pathname.startsWith("/watch") && u.searchParams.get("v");
    const looksLikeVideos = /\/videos\/\d+/.test(u.pathname);
    if (!isWatch && !looksLikeVideos) return null;

    const href = encodeURIComponent(url);
    // Build plugin URL; show_text=false yields just the player
    return `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false&width=800`;
  } catch {}
  return null;
}

function buildIframeWrap(src, ratio = "16x9") {
  const wrap = document.createElement("div");
  wrap.className = `embed embed-${ratio}`;
  wrap.innerHTML = `<iframe src="${src}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  return wrap;
}

/** Make existing iframes responsive; convert bare links to embeds */
function enhanceEmbeds(root) {
  if (!root) return;

  // 0) Make existing iframes responsive (wrap in .embed if not already)
  root.querySelectorAll("iframe").forEach((f) => {
    const parent = f.parentElement;
    if (!parent || !parent.classList.contains("embed")) {
      const wrap = document.createElement("div");
      wrap.className = "embed embed-16x9";
      f.replaceWith(wrap);
      f.removeAttribute("width");
      f.removeAttribute("height");
      f.setAttribute("loading", "lazy");
      wrap.appendChild(f);
    }
  });

  // 1) Handle WP wrappers or nodes that might only contain a URL
  const wrappers = root.querySelectorAll(
    "figure.wp-block-embed, .wp-block-embed__wrapper, div.wp-video, p, div"
  );
  wrappers.forEach((el) => {
    if (el.querySelector && el.querySelector("iframe")) return; // already handled above

    // Prefer WP data attribute
    let url = el.getAttribute && el.getAttribute("data-oembed-url");
    // Else anchor href
    if (!url) {
      const a = el.querySelector && el.querySelector("a[href]");
      if (a && a.getAttribute) url = a.getAttribute("href") || "";
    }
    // Else element text that looks like a URL
    if (!url) {
      const t = (el.textContent || "").trim();
      if (/^https?:\/\//i.test(t)) url = t;
    }
    if (!url) return;

    let src = null;
    const yt = toYouTubeId(url);
    if (yt) src = `https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1`;

    if (!src) {
      const vm = toVimeoId(url);
      if (vm) src = `https://player.vimeo.com/video/${vm}`;
    }

    if (!src) {
      const fb = toFacebookVideoPluginSrc(url);
      if (fb) src = fb;
    }

    if (src) {
      el.replaceWith(buildIframeWrap(src));
    }
  });

  // 2) Any leftover standalone anchors → try convert to embeds (covers image-wrapped links)
  root.querySelectorAll("a[href]").forEach((a) => {
    if (a.closest(".embed")) return; // already inside an embed
    const url = a.getAttribute("href") || "";
    if (!url) return;

    let src = null;
    const yt = toYouTubeId(url);
    if (yt) src = `https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1`;

    if (!src) {
      const vm = toVimeoId(url);
      if (vm) src = `https://player.vimeo.com/video/${vm}`;
    }

    if (!src) {
      const fb = toFacebookVideoPluginSrc(url);
      if (fb) src = fb;
    }

    if (src) {
      const wrap = buildIframeWrap(src);
      // Replace a logical container if possible
      const container = a.closest("figure, p, div") || a;
      container.replaceWith(wrap);
    }
  });
}

/* =========================
   Render
   ========================= */

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

    const contentRoot = container.querySelector(".content");

    // 1) Remove unwanted first-paragraph indentation
    normalizeFirstParagraph(contentRoot);

    // 2) Wrap existing iframes and convert bare links → responsive embeds
    enhanceEmbeds(contentRoot);
  } catch (err) {
    console.error("[OkObserver] Failed to render post", err);
    container.innerHTML = `<p class="center">Error loading post.</p>`;
  }
}
