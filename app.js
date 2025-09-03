// app.js — OkObserver (v1.40.2 — de-lazy images + stronger FB/Vimeo scrub)
const APP_VERSION = "v1.40.2";
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
  // De-lazy images (Smush/Jetpack style placeholders)
  function deLazyImages(root) {
    if (!root) return;
    root.querySelectorAll("img").forEach((img) => {
      const realSrc =
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        img.getAttribute("data-original") || "";
      const realSrcset =
        img.getAttribute("data-srcset") ||
        img.getAttribute("data-lazy-srcset") || "";

      if (realSrc) img.setAttribute("src", realSrc);
      if (realSrcset) img.setAttribute("srcset", realSrcset);

      img.classList.remove("lazyload", "lazy", "jetpack-lazy-image");

      img.loading = "lazy";
      img.decoding = "async";
      img.style.maxWidth = img.style.maxWidth || "100%";
      img.style.height = img.style.height || "auto";
    });
  }

  // Aggressive normalization of Gutenberg embeds (Facebook + Vimeo)
  function normalizeContent(html) {
    const root = document.createElement("div");
    root.innerHTML = html || "";

    // … existing embed parsing code …

    // cleanup leftover empty wrappers
    root.querySelectorAll(".wp-block-embed, .wp-block-embed__wrapper").forEach((el) => {
      if (!el.querySelector("iframe, a, img, video") && !el.textContent.trim()) el.remove();
    });

    // ✅ New: convert lazy images to real images
    deLazyImages(root);

    return root.innerHTML;
  }

  // Facebook helpers
  function extractFacebookVideoId(url) {
    try {
      const u = new URL(url);
      if ((u.hostname.endsWith("facebook.com") || u.hostname.endsWith("fb.watch")) && u.searchParams.get("v")) {
        return u.searchParams.get("v");
      }
      const m = u.pathname.match(/\/videos\/(\d+)(?:\/|$)/);
      if (m && m[1]) return m[1];
    } catch {}
    return null;
  }
  // (rest of fb/vimeo helpers unchanged)
  // … keep FB/Vimeo helpers & scrubbers here (unchanged except already aggressive) …

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

  // renderHome (unchanged, still handles infinite scroll + fallbacks)

  // renderPost (key: calls normalizeContent → which calls deLazyImages now)
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
        const fbId = findFacebookVideoIdInHtml(normalizedHtml);
        if (fbId) hero = fbVideoThumbUrl(fbId);
      }
      if (!hero) {
        const vmId = findVimeoIdInHtml(normalizedHtml);
        if (vmId) hero = vimeoThumbUrl(vmId);
      }

      app.innerHTML = `
        <article class="post">
          <p><a href="#/" class="btn">← Back to posts</a></p>
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">
            ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
            <span class="date">${date}</span>
          </div>
          ${hero ? `<img class="hero" src="${hero}" alt="">` : ""}
          <div class="content">${normalizedHtml}</div>
          ${
            tags.length
              ? `<div class="tags">Tags: ${tags
                  .map((t) => `<a class="tag-chip" href="https://okobserver.org/tag/${t.slug}/" target="_blank" rel="noopener">${esc(t.name)}</a>`)
                  .join("")}</div>`
              : ""
          }
          <p><a href="#/" class="btn">← Back to posts</a></p>
        </article>
      `;

      hardenLinks(document.querySelector(".post"));
      scrubBlankFacebookBlocks(document.querySelector(".post"));
      scrubBlankVimeoBlocks(document.querySelector(".post"));

      const heroImg = document.querySelector(".post img.hero");
      if (heroImg) heroImg.addEventListener("error", () => heroImg.remove(), { once: true });

    } catch (e) {
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Error loading post: ${e.message || e}</div>`;
    }
  }
  // Self-check
  function selfCheck() {
    const missing = [];
    if (typeof renderHome !== "function") missing.push("renderHome");
    if (typeof renderPost !== "function") missing.push("renderPost");
    if (typeof fetchPosts !== "function") missing.push("fetchPosts");
    if (typeof fetchPost !== "function") missing.push("fetchPost");
    if (missing.length) {
      showError(`App init error: missing functions → ${missing.join(", ")}`);
      throw new Error("App self-check failed");
    }
  }

  function router() {
    try {
      const hash = location.hash || "#/";
      if (hash === "#/" || hash === "") { renderHome({ search: "" }); return; }
      if (hash.startsWith("#/post/")) { renderPost(hash.split("/")[2]?.split("?")[0]); return; }
      if (hash === "#/about") {
        app.innerHTML = `<article class="post"><h1>About</h1><p><strong>OkObserver</strong> unofficial reader.</p></article>`;
        return;
      }
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Page not found</div>`;
    } catch (e) { showError(`Router crash: ${e?.message || e}`); }
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("load", () => { try { selfCheck(); router(); } catch {} });
  window.addEventListener("error", (e) => showError(`Runtime error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => showError(`Unhandled promise rejection: ${e.reason?.message || e.reason}`));
})();
