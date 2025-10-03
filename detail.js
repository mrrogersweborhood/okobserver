// detail.js — post detail with "lite" embeds (always visible preview; iframe on click)

import { fetchPostById, getFeaturedImage, getAuthorName } from "./api.js";
import { decodeEntities, ordinalDate } from "./shared.js";

/* ---------------- DOM helpers ---------------- */
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
    .post .meta-author-date { font-size:.95em; color:#1E90FF; margin:8px 0 12px; display:flex; gap:10px; align-items:center; }
    .post .meta-author-date .date { color:#000; font-weight:normal; }
    .post .hero { width:100%; max-height:520px; object-fit:cover; margin:16px 0; border-radius:10px; display:block; }
    .post .hero--clickable { cursor:pointer; position:relative; }
    .post .hero--clickable:hover { filter:brightness(0.92); }

    /* 16:9 responsive box with guaranteed height (prevents zero-height white space) */
    .embed { position:relative; width:100%; margin:16px 0; background:#000; border-radius:10px; overflow:hidden; }
    .embed--16x9 { padding-top:56.25%; }
    .embed iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }

    /* Lite player preview */
    .lite { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; cursor:pointer; }
    .lite img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; filter:saturate(1.05) contrast(1.05); }
    .lite::before { content:""; width:82px; height:82px; border-radius:50%; background:rgba(0,0,0,.45); box-shadow:0 2px 10px rgba(0,0,0,.35); z-index:1; }
    .lite::after { content:""; position:absolute; width:0; height:0; border-left:28px solid #fff; border-top:16px solid transparent; border-bottom:16px solid transparent; margin-left:10px; z-index:1; }
    .lite:hover img { filter:brightness(.9); }

    /* Content cleanup + images */
    .post .content img { max-width:100%; height:auto; display:block; margin:12px auto; }
    .post .content p:first-of-type, 
    .post .content div:first-of-type { text-indent:0 !important; margin-left:0 !important; padding-left:0 !important; }
    .post .content a { color:#1E90FF; }

    .post .back { margin:22px 0 6px; }
  `;
  host.appendChild(style);
}

/* ---------------- Video detection ---------------- */
function findFirstVideoRef(root) {
  // Prefer explicit iframes
  const ifr = root.querySelector("iframe[src]");
  if (ifr) {
    const src = ifr.getAttribute("src") || "";
    if (/vimeo\.com\/video\//i.test(src)) return { kind: "vimeo", url: src, node: ifr };
    if (/youtube\.com\/embed\/|youtube\.com\/watch|youtu\.be\//i.test(src)) return { kind: "youtube", url: src, node: ifr };
    if (/facebook\.com\/plugins\/video|facebook\.com\/watch/i.test(src)) return { kind: "facebook", url: src, node: ifr };
  }
  // Then anchors
  const a = Array.from(root.querySelectorAll("a[href]")).find(el =>
    /facebook\.com\/.*\/videos?\/|facebook\.com\/watch/i.test(el.href) ||
    /vimeo\.com\/\d+/.test(el.href) ||
    /youtube\.com\/watch|youtu\.be\//i.test(el.href)
  );
  if (a) {
    if (/facebook\.com/i.test(a.href)) return { kind: "facebook", url: a.href, node: a };
    if (/vimeo\.com\/\d+/.test(a.href)) return { kind: "vimeo", url: a.href, node: a };
    if (/youtube\.com\/watch|youtu\.be\//i.test(a.href)) return { kind: "youtube", url: a.href, node: a };
  }
  return null;
}

/* ---------------- Lite preview builders ---------------- */
function youTubeIdFromUrl(url) {
  try {
    const u = new URL(url, location.href);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const em = url.match(/embed\/([^?&#/]+)/);
    if (em) return em[1];
  } catch {}
  return "";
}
function youTubeThumb(id) {
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
}

function vimeoIdFromUrl(url) {
  const m = String(url).match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return m ? m[1] : "";
}

/* Build a 16:9 container with a thumbnail + play overlay;
   on click, swap in the real iframe */
function buildLiteEmbed({ kind, url, thumb, title = "" }) {
  const box = h("div", { class: "embed embed--16x9" });
  const lite = h("div", { class: "lite", role: "button", "aria-label": "Play video" });
  if (thumb) lite.appendChild(h("img", { src: thumb, alt: title, decoding: "async", loading: "lazy" }));
  box.appendChild(lite);

  lite.addEventListener("click", () => {
    let src = url;
    if (kind === "youtube") {
      const id = youTubeIdFromUrl(url);
      src = id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : url;
    } else if (kind === "vimeo") {
      const vid = vimeoIdFromUrl(url);
      // Accept both player and page URLs; prefer player
      src = /player\.vimeo\.com\/video\//.test(url)
        ? `${url}${url.includes("?") ? "&" : "?"}autoplay=1`
        : (vid ? `https://player.vimeo.com/video/${vid}?autoplay=1` : url);
    }
    const iframe = h("iframe", {
      src,
      allow:
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen",
      allowfullscreen: true,
      title: title || "Embedded video",
    });
    box.replaceChild(iframe, lite);
  });

  return box;
}

/* Facebook cannot be trusted in iframes → hero click opens new tab */
function clickableHero(href, imgSrc, alt = "") {
  const wrap = h("div", { class: "embed embed--16x9" });
  const img = h("img", { class: "hero hero--clickable", src: imgSrc, alt });
  const overlay = h("div", { class: "lite" }); // reuse play overlay look
  wrap.appendChild(img);
  wrap.appendChild(overlay);
  wrap.addEventListener("click", () => {
    try { window.open(href, "_blank", "noopener"); } catch { location.href = href; }
  });
  return wrap;
}

/* Remove the original node we promoted to avoid duplicates */
function removePromotedNodeFrom(html, promotedNode) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  if (promotedNode && promotedNode._promoteId) {
    const match = tmp.querySelector(`[data-promote-id="${promotedNode._promoteId}"]`);
    if (match) match.remove();
  }
  // Clean empty wrappers
  tmp.querySelectorAll("p,div").forEach(n => {
    if (!n.textContent.trim() && n.children.length === 0) n.remove();
  });
  return tmp.innerHTML;
}

/* ---------------- Main renderer ---------------- */
export async function renderPost(id) {
  const app = document.getElementById("app");
  if (!app) return;

  const container = h("div", { class: "container" });
  injectScopedStyles(container);

  // Fetch post
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

  // Probe content for first video reference
  const probe = document.createElement("div");
  probe.innerHTML = rawContent;
  const vref = findFirstVideoRef(probe);
  if (vref?.node) {
    vref.node._promoteId = String(Math.random()).slice(2);
    vref.node.setAttribute("data-promote-id", vref.node._promoteId);
  }

  // Build article
  const postEl = h("article", { class: "post" });
  postEl.appendChild(h("h1", {}, title));
  postEl.appendChild(h("div", { class: "meta-author-date" },
    h("strong", {}, author),
    h("span", { class: "date" }, dateText)
  ));

  // HERO area (lite embeds or clickable hero)
  let heroInserted = false;

  if (vref) {
    if (vref.kind === "youtube") {
      const id = youTubeIdFromUrl(vref.url);
      const thumb = youTubeThumb(id) || getFeaturedImage(post) || (probe.querySelector("img[src]")?.getAttribute("src")) || "";
      postEl.appendChild(buildLiteEmbed({ kind: "youtube", url: vref.url, thumb, title }));
      heroInserted = true;
    } else if (vref.kind === "vimeo") {
      // Try featured image or first inline image as the preview
      const thumb = getFeaturedImage(post) || (probe.querySelector("img[src]")?.getAttribute("src")) || "";
      postEl.appendChild(buildLiteEmbed({ kind: "vimeo", url: vref.url, thumb, title }));
      heroInserted = true;
    } else if (vref.kind === "facebook") {
      const thumb = getFeaturedImage(post) || (probe.querySelector("img[src]")?.getAttribute("src")) || "icon.png";
      postEl.appendChild(clickableHero(vref.url, thumb, title));
      heroInserted = true;
    }
  }

  if (!heroInserted) {
    const hero = getFeaturedImage(post);
    if (hero) postEl.appendChild(h("img", { class: "hero", src: hero, alt: "" }));
  }

  // Body (remove promoted node to avoid duplicates)
  const content = h("div", { class: "content" });
  content.innerHTML = removePromotedNodeFrom(rawContent, vref?.node);

  // Back to posts (bottom only)
  const back = h("div", { class: "back" },
    h("a", { class: "btn", href: "#/" }, "Back to posts")
  );

  postEl.appendChild(content);
  postEl.appendChild(back);

  // Mount
  container.appendChild(postEl);
  app.innerHTML = "";
  app.appendChild(container);

  // Scroll top
  requestAnimationFrame(() => window.scrollTo(0, 0));
}
