// app.js — OkObserver (v1.39.0 — FB raw text embed + scrub fix)
const APP_VERSION = "v1.39.0";
window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT = "cartoon";
  const app = document.getElementById("app");

  // Footer year + version
  window.addEventListener("DOMContentLoaded", () => {
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    const v = document.getElementById("appVersion");
    if (v) v.textContent = APP_VERSION;
  });

  // Error banner helper
  function showError(message) {
    const msg = (message && message.message) ? message.message : String(message || "Something went wrong.");
    const div = document.createElement("div");
    div.className = "error-banner";
    div.innerHTML = `<button class="close" aria-label="Dismiss error" title="Dismiss">×</button>${msg}`;
    app.prepend(div);
  }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".error-banner .close");
    if (btn) btn.closest(".error-banner")?.remove();
  });

  // Utils
  const esc = (s) => (s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const getAuthor = (p) => p?._embedded?.author?.[0]?.name || "";
  const hasExcluded = (p) => (p?._embedded?.["wp:term"]?.[0] || [])
    .some(c => (c?.name || "").toLowerCase() === EXCLUDE_CAT);
  const getTags = (emb) => (emb?.flat() || []).filter(t => t?.taxonomy === "post_tag");

  function ordinalDate(iso) {
    const d = new Date(iso);
    const day = d.getDate();
    const suf = (n) => (n > 3 && n < 21) ? "th" : (["th","st","nd","rd"][Math.min(n % 10, 4)] || "th");
    return `${d.toLocaleString("en-US",{month:"long"})} ${day}${suf(day)}, ${d.getFullYear()}`;
  }

  function firstImgFromHTML(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    const img = div.querySelector("img");
    if (!img) return "";
    const ss = img.getAttribute("srcset");
    if (ss) {
      const last = ss.split(",").map(s=>s.trim()).pop();
      const url = last?.split(" ")?.[0];
      if (url) return url;
    }
    return img.getAttribute("data-src") || img.getAttribute("src") || "";
  }

  function featuredImage(p) {
    const m = p?._embedded?.["wp:featuredmedia"]?.[0];
    if (!m) return "";
    const sizes = m.media_details?.sizes || {};
    return sizes?.["2048x2048"]?.source_url || sizes?.full?.source_url || sizes?.large?.source_url ||
           sizes?.medium_large?.source_url || sizes?.medium?.source_url || m.source_url || "";
  }

  function hardenLinks(root) {
    if (!root) return;
    root.querySelectorAll("a[href]").forEach(a => {
      a.target = "_blank";
      a.rel = "noopener";
    });
  }
  // Aggressive normalization of Gutenberg embeds (handles iframes, anchors, RAW TEXT URLs)
  function normalizeContent(html) {
    const root = document.createElement("div");
    root.innerHTML = html || "";

    // find a FB URL in plain text
    const findFbUrlInText = (s) => {
      if (!s) return null;
      const m = s.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s<>"']+/i) ||
                s.match(/https?:\/\/fb\.watch\/[^\s<>"']+/i);
      return m ? m[0] : null;
    };

    // visible fallback block
    const buildFallback = (url) => {
      const box = document.createElement("div");
      box.className = "embed-fallback";
      box.innerHTML = `
        <div class="center" style="margin:12px 0;padding:16px;border:1px solid #ddd;border-radius:10px;background:#fafafa">
          <div style="margin-bottom:8px;">This video can’t be embedded here.</div>
          ${url ? `<a class="btn" href="${url}" target="_blank" rel="noopener">Open on Facebook</a>` : ""}
        </div>
      `;
      return box;
    };

    // target outer Gutenberg containers and replace the entire container
    const containers = root.querySelectorAll([
      "figure.wp-block-embed",
      "div.wp-block-embed",
      ".wp-block-embed-facebook",
      ".wp-block-embed__wrapper"
    ].join(","));

    containers.forEach((cont) => {
      let url = null;

      // iframe src
      const iframe = cont.querySelector('iframe[src*="facebook.com"]');
      if (iframe?.src) url = iframe.src;

      // anchor href
      if (!url) {
        const a = cont.querySelector('a[href*="facebook.com"], a[href*="fb.watch"]');
        if (a?.href) url = a.href;
      }

      // raw text inside wrapper
      if (!url) {
        const raw = findFbUrlInText(cont.textContent?.trim() || "");
        if (raw) url = raw;
      }

      // replace whole container if FB-like or empty embed
      if (url || !cont.querySelector("iframe, a, img, video")) {
        cont.replaceWith(buildFallback(url));
      }
    });

    // cleanup leftover empty wrappers
    root.querySelectorAll(".wp-block-embed, .wp-block-embed__wrapper").forEach((el) => {
      if (!el.querySelector("iframe, a, img, video") && !el.textContent.trim()) el.remove();
    });

    return root.innerHTML;
  }

  // Facebook video helpers (thumbnail fallback)
  function extractFacebookVideoId(url) {
    try {
      const u = new URL(url);
      // https://www.facebook.com/watch/?v=123
      if ((u.hostname.endsWith("facebook.com") || u.hostname.endsWith("fb.watch")) && u.searchParams.get("v")) {
        return u.searchParams.get("v");
      }
      // https://www.facebook.com/<page>/videos/123/
      const m = u.pathname.match(/\/videos\/(\d+)(?:\/|$)/);
      if (m && m[1]) return m[1];
    } catch {}
    return null;
  }

  function findFacebookVideoIdInHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";

    // anchors first
    const a = div.querySelector('a[href*="facebook.com/watch"], a[href*="facebook.com/"], a[href*="/videos/"]');
    if (a?.href) {
      const id = extractFacebookVideoId(a.href);
      if (id) return id;
    }

    // iframes next
    const iframe = div.querySelector('iframe[src*="facebook.com"]');
    if (iframe?.src) {
      const id = extractFacebookVideoId(iframe.src);
      if (id) return id;
    }

    // RAW TEXT url
    const text = div.textContent || "";
    const m = text.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s<>"']+/i) ||
              text.match(/https?:\/\/fb\.watch\/[^\s<>"']+/i);
    if (m) {
      const id = extractFacebookVideoId(m[0]);
      if (id) return id;
    }
    return null;
  }

  function fbVideoThumbUrl(videoId) {
    return `https://graph.facebook.com/${videoId}/picture?type=large`;
  }

  // Final DOM sweep: replace lone FB anchors that slipped through with a visible fallback
  function scrubBlankFacebookBlocks(scope) {
    const host = scope || document;
    host.querySelectorAll("p, div, figure").forEach((el) => {
      // skip if there is media or our fallback already
      if (el.querySelector("img, iframe, video, .embed-fallback, .btn")) return;
      // only a single child and it's an <a>?
      if (el.childElementCount !== 1) return;
      const a = el.querySelector("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!/facebook\.com|fb\.watch/i.test(href)) return;

      const box = document.createElement("div");
      box.className = "embed-fallback";
      box.innerHTML = `
        <div class="center" style="margin:12px 0;padding:16px;border:1px solid #ddd;border-radius:10px;background:#fafafa">
          <div style="margin-bottom:8px;">This video can’t be embedded here.</div>
          <a class="btn" href="${href}" target="_blank" rel="noopener">Open on Facebook</a>
        </div>
      `;
      el.replaceWith(box);
    });
  }
  // API
  async function fetchPosts({ page = 1, search = "" } = {}) {
    const url = `${BASE}/posts?_embed=1&per_page=${PER_PAGE}&page=${page}${
      search ? `&search=${encodeURIComponent(search)}` : ""
    }`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const totalPages = Number(res.headers.get("X-WP-TotalPages") || "1");
    const items = await res.json();
    return { posts: items.filter((p) => !hasExcluded(p)), totalPages };
  }

  async function fetchPost(id) {
    const res = await fetch(`${BASE}/posts/${id}?_embed=1`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Home (Infinite Scroll + button fallback) unchanged...

  // Post detail (normalize + scrub FB blocks)
  async function renderPost(id) {
    app.innerHTML = `<p class="center">Loading post…</p>`;
    try {
      const p = await fetchPost(id);
      if (!p) return;

      if (hasExcluded(p)) {
        app.innerHTML = `<div class="error-banner"><button class="close">×</button>This post is not available.</div>`;
        return;
      }

      const author = esc(getAuthor(p));
      const date = ordinalDate(p.date);
      const tags = getTags(p._embedded?.["wp:term"]) || [];

      const rawHtml = p.content?.rendered || "";
      const normalizedHtml = normalizeContent(rawHtml);

      let hero = featuredImage(p) || firstImgFromHTML(normalizedHtml) || "";
      if (!hero) {
        const fbVid = findFacebookVideoIdInHtml(normalizedHtml);
        if (fbVid) hero = fbVideoThumbUrl(fbVid);
      }

      app.innerHTML = `
        <article class="post">
          <p><a href="#/" class="btn" style="margin-bottom:12px">← Back to posts</a></p>
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">
            ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
            <span class="date">${date}</span>
          </div>
          ${hero ? `<img class="hero" src="${hero}" alt="" loading="lazy">` : ""}
          <div class="content">${normalizedHtml}</div>
          ${
            tags.length
              ? `<div class="tags"><span style="margin-right:6px;">Tags:</span>${tags
                  .map((t) => `<a class="tag-chip" href="https://okobserver.org/tag/${t.slug}/" target="_blank" rel="noopener">${esc(t.name)}</a>`)
                  .join("")}</div>`
              : ""
          }
          <p><a href="#/" class="btn" style="margin-top:16px">← Back to posts</a></p>
        </article>
      `;

      // Harden links
      hardenLinks(document.querySelector(".post"));

      // Scrub stray blank FB blocks
      scrubBlankFacebookBlocks(document.querySelector(".post"));

      // If hero fails (blocked image), remove
      const heroImg = document.querySelector(".post img.hero");
      if (heroImg) heroImg.addEventListener("error", () => heroImg.remove(), { once: true });

    } catch (e) {
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Error loading post: ${e.message || e}</div>`;
    }
  }
  // Router
  function router() {
    try {
      const hash = location.hash || "#/";
      if (hash === "#/" || hash === "") {
        renderHome({ search: "" });
        return;
      }
      if (hash.startsWith("#/post/")) {
        const id = hash.split("/")[2]?.split("?")[0];
        renderPost(id);
        return;
      }
      if (hash === "#/about") {
        app.innerHTML = `<article class="post">
          <h1>About</h1>
          <p><strong>OkObserver</strong> is an unofficial reader for okobserver.org.</p>
        </article>`;
        return;
      }
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Page not found</div>`;
    } catch (e) {
      showError(`Router crash: ${e?.message || e}`);
    }
  }

  // Wire up router + global error handlers
  window.addEventListener("hashchange", router);
  window.addEventListener("load", router);
  window.addEventListener("error", (e) => showError(`Runtime error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) =>
    showError(`Unhandled promise rejection: ${e.reason?.message || e.reason}`)
  );
})();
