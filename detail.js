// detail.js — single post detail
// Guarantees a good FB video UX WITHOUT duplicates:
// - If content already has a video (iframe/video or an fb-link-card), DO NOT wrap hero.
// - Otherwise, if we find a Facebook video URL, wrap the HERO image as a clickable link.
// - Also: normalize first paragraph, responsive YT/Vimeo, bottom-only “Back to posts”.

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

function buildFacebookClickableImage(url, src) {
  const wrap = document.createElement("div");
  wrap.className = "fb-link-card";
  wrap.style.margin = "16px 0";
  wrap.style.textAlign = "center";

  if (src) {
    const img = document.createElement("img");
    img.src = src;
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
    wrap.style.display = "none";
  }

  return wrap;
}

/** Extract first FB video URL from RAW HTML (before DOM tweaks) */
function findFacebookUrlFromHtml(html) {
  if (!html) return "";
  // Match either /watch?v=ID or /videos/ID patterns
  const re = /https?:\/\/(?:www\.)?facebook\.com\/(?:watch\/?\?v=\d+|[^"'\s]+\/videos\/\d+)/i;
  const m = html.match(re);
  return m ? m[0] : "";
}

/** Secondary: scan rendered DOM for a FB URL (safety net) */
function findFirstFacebookVideoUrlInDom(root) {
  let fbUrl = "";
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (href && !fbUrl && isFacebookVideoUrl(href)) fbUrl = href;
  });
  if (!fbUrl) {
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

function removeResidualFacebookAnchors(root) {
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (href && isFacebookVideoUrl(href)) {
      if (!a.closest(".fb-link-card")) {
        a.replaceWith(document.createTextNode(""));
      }
    }
  });
}

/* =========================
   Embed conversion
   ========================= */
function enhanceEmbeds(root) {
  if (!root) return;

  // Wrap existing iframes responsively
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

  // Convert standalone anchors for YT/Vimeo (Facebook handled via image approach)
  root.querySelectorAll("a[href]").forEach((a) => {
    const url = a.getAttribute("href") || "";
    if (!url) return;
    if (a.closest(".embed") || a.closest(".fb-link-card")) return;

    const yt = toYouTubeId(url);
    if (yt) {
      const wrap = buildIframeWrap(`https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1`);
      a.replaceWith(wrap);
      return;
    }

    const vm = toVimeoId(url);
    if (vm) {
      const wrap = buildIframeWrap(`https://player.vimeo.com/video/${vm}`);
      a.replaceWith(wrap);
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

    // Capture FB URL from RAW HTML before DOM ops
    const fbUrlFromHtml = findFacebookUrlFromHtml(post?.content?.rendered || "");

    // Render shell (hero first, then content)
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

    // De-indent first paragraph and enable YT/Vimeo responsive embeds
    normalizeFirstParagraph(contentRoot);
    enhanceEmbeds(contentRoot);

    // Determine FB URL (prefer raw HTML match; fallback to DOM)
    const fbUrl = fbUrlFromHtml || findFirstFacebookVideoUrlInDom(contentRoot);

    // SAFEGUARD: If content already has a visible video, DO NOT wrap hero (prevents duplicates)
    const hasExistingVideo =
      !!contentRoot.querySelector("iframe, video, .fb-link-card");

    if (fbUrl) {
      if (!hasExistingVideo) {
        // No visible video yet → guarantee a clickable image via HERO
        const heroEl = container.querySelector(".hero");
        if (heroEl) {
          const a = document.createElement("a");
          a.href = fbUrl;
          a.target = "_blank";
          a.rel = "noopener";
          heroEl.replaceWith(a);
          a.appendChild(heroEl);
        } else if (heroSrc) {
          // Rare: no hero element but we have heroSrc → inject clickable hero above content
          const card = buildFacebookClickableImage(fbUrl, heroSrc);
          const article = container.querySelector("article.post");
          const content = container.querySelector(".content");
          if (article && content) article.insertBefore(card, content);
        } else {
          // Last resort: clone first content image
          const anyImg = contentRoot.querySelector("img");
          if (anyImg && anyImg.getAttribute("src")) {
            const card = buildFacebookClickableImage(fbUrl, anyImg.getAttribute("src"));
            const article = container.querySelector("article.post");
            const content = container.querySelector(".content");
            if (article && content) article.insertBefore(card, content);
          }
        }
      }

      // Remove leftover FB anchors/URLs so only image/embed remains
      removeResidualFacebookAnchors(contentRoot);
    }
  } catch (err) {
    console.error("[OkObserver] Failed to render post", err);
    container.innerHTML = `<p class="center">Error loading post.</p>`;
  }
}
