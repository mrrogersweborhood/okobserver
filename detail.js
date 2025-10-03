// detail.js — post detail with robust video handling (Vimeo/YouTube embed; Facebook = clickable hero)

import { fetchPostById, getFeaturedImage, getAuthorName } from "./api.js";
import { decodeEntities, ordinalDate } from "./shared.js";

// small helper
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v, { passive: true });
    } else if (v !== false && v != null) {
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === "string") el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}

function injectScopedStyles(host) {
  const style = document.createElement("style");
  style.textContent = `
    .post { max-width: 900px; margin: 0 auto; padding: 16px; }
    .post h1 { margin: 0; color: #1E90FF; }
    .post .meta-author-date { font-size: .95em; color: #1E90FF; margin: 8px 0 12px; display:flex; gap:10px; align-items:center; }
    .post .meta-author-date .date { color:#000; font-weight: normal; }
    .post .hero { width:100%; max-height: 520px; object-fit: cover; margin: 16px 0; border-radius: 10px; display:block; }
    .post .hero--clickable { cursor: pointer; position: relative; }
    .post .hero--clickable:hover { filter: brightness(0.92); }
    .post .hero-wrap { position: relative; }
    .post .hero-play {
      position: absolute; inset: 0; display:flex; align-items:center; justify-content:center; pointer-events:none;
    }
    .post .hero-play::before {
      content:""; width:72px; height:72px; border-radius:50%;
      background: rgba(0,0,0,.5); box-shadow:0 2px 10px rgba(0,0,0,.3);
    }
    .post .hero-play::after {
      content:""; position:absolute; width:0; height:0;
      border-left: 24px solid #fff; border-top:14px solid transparent; border-bottom:14px solid transparent; margin-left:-8px;
    }

    /* Responsive embeds */
    .embed { position: relative; width: 100%; margin: 16px 0; }
    .embed--16x9 { padding-top: 56.25%; }
    .embed iframe, .embed video { position: absolute; left:0; top:0; width:100%; height:100%; border:0; border-radius:10px; background:#000; }

    /* Content cleanup */
    .post .content img { max-width: 100%; height: auto; display: block; margin: 12px auto; }
    .post .content p:first-of-type, 
    .post .content div:first-of-type { text-indent:0 !important; margin-left:0 !important; padding-left:0 !important; }
    .post .content a { color:#1E90FF; }

    .post .back { margin: 22px 0 6px; }
  `;
  host.appendChild(style);
}

/* Detect first video reference in HTML (Vimeo/YouTube iframe or Facebook link/iframe).
   Returns { kind: 'vimeo'|'youtube'|'facebook', url, html, node } or null. */
function findFirstVideoRef(root) {
  // 1) Look for iframes
  const ifr = root.querySelector("iframe[src]");
  if (ifr) {
    const src = ifr.getAttribute("src") || "";
    if (/vimeo\.com\/video\//i.test(src)) return { kind: "vimeo", url: src, html: ifr.outerHTML, node: ifr };
    if (/youtube\.com\/embed\/|youtube\.com\/watch|youtu\.be\//i.test(src)) return { kind: "youtube", url: src, html: ifr.outerHTML, node: ifr };
    if (/facebook\.com\/plugins\/video|facebook\.com\/watch/i.test(src)) return { kind: "facebook", url: src, html: ifr.outerHTML, node: ifr };
  }

  // 2) Facebook anchor
  const a = Array.from(root.querySelectorAll("a[href]")).find(el => /facebook\.com\/.*\/videos?\/|facebook\.com\/watch/i.test(el.href));
  if (a) return { kind: "facebook", url: a.href, html: a.outerHTML, node: a };

  return null;
}

function embedPlayer(kind, url) {
  if (kind === "vimeo") {
    // Accept either embed URL or page URL; let Vimeo handle params
    const src = url;
    const wrap = h("div", { class: "embed embed--16x9" },
      h("iframe", {
        src, allow: "autoplay; fullscreen; picture-in-picture", allowfullscreen: true, title: "Vimeo video"
      })
    );
    return wrap;
  }
  if (kind === "youtube") {
    // Normalize to embed
    let id = "";
    try {
      const u = new URL(url, location.href);
      if (u.hostname === "youtu.be") id = u.pathname.slice(1);
      else if (u.searchParams.get("v")) id = u.searchParams.get("v");
      else {
        const m = url.match(/embed\/([^?&#/]+)/);
        if (m) id = m[1];
      }
    } catch {}
    const src = id ? `https://www.youtube.com/embed/${id}` : url;
    return h("div", { class: "embed embed--16x9" },
      h("iframe", {
        src, allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
        allowfullscreen: true, title: "YouTube video"
      })
    );
  }
  // Facebook is blocked in iframes frequently → handled as clickable hero upstream.
  return null;
}

function clickableHero(href, imgSrc, alt = "") {
  const wrap = h("div", { class: "hero-wrap" });
  const img = h("img", { class: "hero hero--clickable", src: imgSrc, alt });
  const overlay = h("div", { class: "hero-play" });
  wrap.appendChild(img);
  wrap.appendChild(overlay);
  wrap.addEventListener("click", () => {
    try { window.open(href, "_blank", "noopener"); } catch { location.href = href; }
  });
  return wrap;
}

function sanitizeAndPrepareContent(html, promotedNode) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";

  // Remove the node we promoted (to avoid duplicate player or same FB link)
  if (promotedNode) {
    const match = tmp.querySelector(`[data-promote-id="${promotedNode._promoteId}"]`);
    if (match) match.remove();
  }

  // Remove empty wrappers left behind by editors
  tmp.querySelectorAll("p, div").forEach(n => {
    if (!n.textContent.trim() && n.children.length === 0) n.remove();
  });

  return tmp.innerHTML;
}

export async function renderPost(id) {
  const app = document.getElementById("app");
  if (!app) return;

  // Container
  const container = h("div", { class: "container" });
  injectScopedStyles(container);

  // Fetch
  let post;
  try {
    post = await fetchPostById(id);
  } catch (e) {
    container.appendChild(h("div", { class: "error-banner" },
      h("button", { class: "close", "aria-label": "Dismiss" }, "×"),
      document.createTextNode(`Failed to load post: ${e?.message || e}`)));
    app.innerHTML = "";
    app.appendChild(container);
    return;
  }

  const title = decodeEntities(post?.title?.rendered || "");
  const dateText = ordinalDate(post?.date || new Date().toISOString());
  const author = getAuthorName(post) || "The Oklahoma Observer";
  const rawContent = String(post?.content?.rendered || "");

  // Parse content to detect first video
  const probe = document.createElement("div");
  probe.innerHTML = rawContent;
  // tag possible promo node so we can remove it later
  const vref = findFirstVideoRef(probe);
  if (vref && vref.node) {
    vref.node._promoteId = String(Math.random()).slice(2);
    vref.node.setAttribute("data-promote-id", vref.node._promoteId);
  }

  // Compose header
  const postEl = h("article", { class: "post" });
  postEl.appendChild(h("h1", {}, title));
  postEl.appendChild(
    h("div", { class: "meta-author-date" },
      h("strong", {}, author),
      h("span", { class: "date" }, dateText)
    )
  );

  // Hero area:
  // - Vimeo/YouTube: a single responsive iframe (and remove duplicate in content)
  // - Facebook: clickable hero image that opens the FB video in a new tab
  // - Else: featured image hero
  let heroInserted = false;

  if (vref) {
    if (vref.kind === "vimeo" || vref.kind === "youtube") {
      const player = embedPlayer(vref.kind, vref.url);
      if (player) {
        postEl.appendChild(player);
        heroInserted = true;
      }
    } else if (vref.kind === "facebook") {
      const heroSrc =
        // Try first inline content image as a thumbnail
        (probe.querySelector("img[src]")?.getAttribute("src")) ||
        getFeaturedImage(post) ||
        "icon.png";
      postEl.appendChild(clickableHero(vref.url, heroSrc, title));
      heroInserted = true;
    }
  }

  if (!heroInserted) {
    const hero = getFeaturedImage(post);
    if (hero) postEl.appendChild(h("img", { class: "hero", src: hero, alt: "" }));
  }

  // Content body (with any promoted node removed)
  const content = h("div", { class: "content" });
  content.innerHTML = sanitizeAndPrepareContent(rawContent, vref?.node);

  // “Back to posts” (bottom only)
  const back = h("div", { class: "back" },
    h("a", { class: "btn", href: "#/" }, "Back to posts")
  );

  postEl.appendChild(content);
  postEl.appendChild(back);

  // Mount
  container.appendChild(postEl);
  app.innerHTML = "";
  app.appendChild(container);

  // Scroll to top on detail load
  requestAnimationFrame(() => window.scrollTo(0, 0));
}
