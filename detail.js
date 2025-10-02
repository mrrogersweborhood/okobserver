// detail.js — single post detail
// - Normalizes first paragraph (removes unwanted indent from WP inline styles, NBSP/ZWSP, leading blockquotes)
// - Makes existing iframes responsive (.embed)
// - Auto-embeds YouTube/Vimeo
// - Facebook videos: prefer image preview; if no inline image, wrap the HERO featured image as the clickable opener to FB (new tab)
// - Removes leftover FB URL anchors/text (no "watch on facebook" text/button shown)
// - Bottom-only “Back to posts” button

import { fetchPost } from "./api.js";
import { ordinalDate } from "./common.js";

/* =========================
   First-paragraph normalizer
   ========================= */

function* walkNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL, null);
  let n = walker.currentNode;
  while (n) { yield n; n = walker.nextNode(); }
}

function stripLeadingWhitespaceDeep(root) {
  const WS_RE = /^[\u00A0\u200B\u200C\u200D\uFEFF \t\r\n]+/;
  for (const n of walkNodes(root)) {
    if (n.nodeType === Node.TEXT_NODE && n.nodeValue) {
      const before = n.nodeValue;
      const after = before.replace(WS_RE, "");
      if (after !== before) {
        n.nodeValue = after;
        if (after.length > 0) return;
      } else if (before.trim().length > 0) {
        return;
      }
    }
  }
}

function firstContentBlock(root) {
  if (!root) return null;
  const nodes = root.querySelectorAll("p, div, section, article, blockquote, ul, ol");
  for (const el of nodes) {
    const txt = (el.textContent || "").replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, "");
    if (txt.length > 0) return el;
  }
  return null;
}

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

function normalizeFirstParagraph(root) {
  if (!root) return;
  stripLeadingWhitespaceDeep(root);
  const first = firstContentBlock(root);
  if (!first) return;
  gentlyUnwrapLeadingBlockquote(root, first);
  zeroInlineLeftOffsets(first, root);
  const firstInline = first.querySelector("span, em, strong, a, i, b, u, small, sup, sub");
  if (firstInline) zeroInlineLeftOffsets(firstInline, root);
  stripLeadingWhitespaceDeep(first);
}

/* =========================
   Video helpers
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

function isFacebookVideoUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("facebook.com")) return false;
    if (u.pathname.startsWith("/watch") && u.searchParams.get("v")) return true;
    if (/\/videos\/\d+/.test(u.pathname)) return true;
  } catch {}
  return false;
}

function buildIframeWrap(src, ratio = "16x9") {
  const wrap = document.createElement("div");
  wrap.className = `embed embed-${ratio}`;
  wrap.innerHTML = `<iframe src="${src}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  return wrap;
}

/** Create a clickable preview image that opens FB in a new tab (no text shown) */
function buildFacebookClickableImage(url, existingImgElOrSrc) {
  const wrap = document.createElement("div");
  wrap.className = "fb-link-card";
  wrap.style.margin = "16px 0";
  wrap.style.textAlign = "center";

  // Accept <img> element OR a URL string
  let src = "";
  let alt = "";
  if (typeof existingImgElOrSrc === "string") {
    src = existingImgElOrSrc;
  } else if (existingImgElOrSrc && existingImgElOrSrc.src) {
    src = existingImgElOrSrc.getAttribute("src");
    alt = existingImgElOrSrc.getAttribute("alt") || "";
  }

  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.loading = "lazy";
    img.decoding = "async";
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    img.style.borderRadius = "8px";
    img.style.display = "block";
    img.style.margin = "0 auto";

    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.appendChild(img);
    wrap.appendChild(a);
  } else {
    // No image at all — hide the card section entirely
    wrap.style.display = "none";
  }

  return wrap;
}

/** Find the first Facebook video URL in the content */
function findFirstFacebookVideoUrl(root) {
  let fbUrl = "";
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!href) return;
    if (!fbUrl && isFacebookVideoUrl(href)) fbUrl = href;
  });
  if (!fbUrl) {
    // Try plain text URL in content
    const t = (root.textContent || "").trim();
    const m = t.match(/https?:\/\/\S+/g);
    if (m) {
      for (const u of m) {
        if (isFacebookVideoUrl(u)) { fbUrl = u; break; }
      }
    }
  }
  return fbUrl;
}

/** Remove leftover FB anchors like "Click here to watch." or raw URLs */
function removeResidualFacebookAnchors(root) {
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!href) return;
    if (isFacebookVideoUrl(href)) {
      if (!a.closest(".fb-link-card")) {
        a.replaceWith(document.createTextNode("")); // drop the anchor text entirely
      }
    }
  });
}

/** Make existing iframes responsive; convert links to embeds; Facebook → clickable image if image present */
function enhanceEmbeds(root) {
  if (!root) return;

  // Make existing iframes responsive
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

  // Typical WP wrappers or <p>/<div> with URL
  const wrappers = root.querySelectorAll("figure.wp-block-embed, .wp-block-embed__wrapper, div.wp-video, p, div");
  wrappers.forEach((el) => {
    if (el.querySelector && el.querySelector("iframe")) return;

    let url = el.getAttribute && el.getAttribute("data-oembed-url");
    let anchorEl = null;
    if (!url) {
      anchorEl = el.querySelector && el.querySelector("a[href]");
      if (anchorEl && anchorEl.getAttribute) url = anchorEl.getAttribute("href") || "";
    }
    if (!url) {
      const t = (el.textContent || "").trim();
      if (/^https?:\/\//i.test(t)) url = t;
    }
    if (!url) return;

    // Facebook → clickable image IF the wrapper has an <img>
    if (isFacebookVideoUrl(url)) {
      const img = anchorEl && anchorEl.querySelector && anchorEl.querySelector("img");
      if (img) {
        const card = buildFacebookClickableImage(url, img);
        el.replaceWith(card);
      }
      return;
    }

    // YouTube
    const yt = toYouTubeId(url);
    if (yt) {
      el.replaceWith(buildIframeWrap(`https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1`));
      return;
    }

    // Vimeo
    const vm = toVimeoId(url);
    if (vm) {
      el.replaceWith(buildIframeWrap(`https://player.vimeo.com/video/${vm}`));
      return;
    }
  });

  // Leftover standalone anchors → convert YT/Vimeo embeds; FB anchors are handled later via hero
  root.querySelectorAll("a[href]").forEach((a) => {
    if (a.closest(".embed") || a.closest(".fb-link-card")) return;
    const url = a.getAttribute("href") || "";
    if (!url) return;

    if (isFacebookVideoUrl(url)) {
      // Skip here (we will wrap hero later if needed)
      return;
    }

    const yt = toYouTubeId(url);
    if (yt) {
      const wrap = buildIframeWrap(`https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1`);
      const container = a.closest("figure, p, div") || a;
      container.replaceWith(wrap);
      return;
    }

    const vm = toVimeoId(url);
    if (vm) {
      const wrap = buildIframeWrap(`https://player.vimeo.com/video/${vm}`);
      const container = a.closest("figure, p, div") || a;
      container.replaceWith(wrap);
      return;
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

    // 1) First-paragraph de-indent
    normalizeFirstParagraph(contentRoot);

    // 2) Handle embeds (YT/Vimeo auto-embed; FB gets handled if it already has an image)
    enhanceEmbeds(contentRoot);

    // 3) If there's a Facebook video URL but NO inline preview image was found,
    //    wrap the HERO image itself as the clickable opener to Facebook.
    const fbUrl = findFirstFacebookVideoUrl(contentRoot);
    if (fbUrl) {
      const alreadyHasCard = contentRoot.querySelector(".fb-link-card");
      if (!alreadyHasCard) {
        const heroEl = container.querySelector(".hero");
        if (heroEl) {
          const link = document.createElement("a");
          link.href = fbUrl;
          link.target = "_blank";
          link.rel = "noopener";
          // replace hero with linked hero
          heroEl.replaceWith(link);
          link.appendChild(heroEl);
        } else if (heroSrc) {
          // No hero element rendered (rare), insert a clickable one above content
          const clickable = buildFacebookClickableImage(fbUrl, heroSrc);
          const article = container.querySelector("article.post");
          const content = container.querySelector(".content");
          if (article && content) article.insertBefore(clickable, content);
        }
      }
    }

    // 4) Remove any residual FB anchors/URLs (no text should remain)
    if (fbUrl) {
      removeResidualFacebookAnchors(contentRoot);
    }
  } catch (err) {
    console.error("[OkObserver] Failed to render post", err);
    container.innerHTML = `<p class="center">Error loading post.</p>`;
  }
}
