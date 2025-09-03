// app.js — OkObserver (v1.40.3 — de-lazy images + strong FB/Vimeo scrub + self-check)
const APP_VERSION = "v1.40.3";
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

  // ===== Embeds: normalize + helpers + scrubbers =====
  function normalizeContent(html) {
    const root = document.createElement("div");
    root.innerHTML = html || "";

    const findFbUrlInText = (s) => {
      if (!s) return null;
      const m = s.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s<>"']+/i) ||
                s.match(/https?:\/\/fb\.watch\/[^\s<>"']+/i);
      return m ? m[0] : null;
    };
    const findVimeoUrlInText = (s) => {
      if (!s) return null;
      const m = s.match(/https?:\/\/(?:www\.|player\.)?vimeo\.com\/[^\s<>"']+/i);
      return m ? m[0] : null;
    };

    const buildFallback = (url, kind="generic") => {
      let thumb = "";
      if (kind === "vimeo") {
        const id = extractVimeoId(url || "");
        if (id) thumb = `<img src="${vimeoThumbUrl(id)}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:10px" onerror="this.remove()">`;
      }
      const box = document.createElement("div");
      box.className = "embed-fallback";
      box.innerHTML = `
        <div class="center" style="margin:12px 0;padding:16px;border:1px solid #ddd;border-radius:10px;background:#fafafa">
          ${thumb}
          <div style="margin-bottom:8px;">This ${kind==="vimeo"?"Vimeo":kind==="facebook"?"Facebook":"external"} video can’t be embedded here.</div>
          ${url ? `<a class="btn" href="${url}" target="_blank" rel="noopener">Open on ${kind==="vimeo"?"Vimeo":"Facebook"}</a>` : ""}
        </div>
      `;
      return box;
    };

    // Replace outer Gutenberg embed containers entirely
    const containers = root.querySelectorAll([
      "figure.wp-block-embed",
      "div.wp-block-embed",
      ".wp-block-embed-facebook",
      ".wp-block-embed-vimeo",
      ".wp-block-embed__wrapper"
    ].join(","));

    containers.forEach((cont) => {
      let url = null;
      let kind = "generic";

      // iframe
      const iframe = cont.querySelector('iframe[src*="facebook.com"], iframe[src*="vimeo.com"]');
      if (iframe?.src) {
        url = iframe.src;
        kind = /vimeo\.com/i.test(url) ? "vimeo" : /facebook\.com/i.test(url) ? "facebook" : "generic";
      }

      // anchor
      if (!url) {
        const a = cont.querySelector('a[href*="facebook.com"], a[href*="fb.watch"], a[href*="vimeo.com"]');
        if (a?.href) {
          url = a.href;
          kind = /vimeo\.com/i.test(url) ? "vimeo" : /facebook\.com|fb\.watch/i.test(url) ? "facebook" : "generic";
        }
      }

      // raw text
      if (!url) {
        const rawVm = findVimeoUrlInText(cont.textContent?.trim() || "");
        const rawFb = findFbUrlInText(cont.textContent?.trim() || "");
        if (rawVm) { url = rawVm; kind = "vimeo"; }
        else if (rawFb) { url = rawFb; kind = "facebook"; }
      }

      if (url || !cont.querySelector("iframe, a, img, video")) {
        cont.replaceWith(buildFallback(url, kind));
      }
    });

    // Cleanup leftover empty wrappers
    root.querySelectorAll(".wp-block-embed, .wp-block-embed__wrapper").forEach((el) => {
      if (!el.querySelector("iframe, a, img, video") && !el.textContent.trim()) el.remove();
    });

    // Convert lazy images so they actually load
    deLazyImages(root);

    return root.innerHTML;
  }

  // ---------- Facebook helpers ----------
  function extractFacebookVideoId(url) {
    try {
      const u = new URL(url);
      if ((u.hostname.endsWith("facebook.com") || u.hostname.endsWith("fb.watch")) && u.searchParams.get("v")) {
        return u.searchParams.get("v"); // /watch/?v=123
      }
      const m = u.pathname.match(/\/videos\/(\d+)(?:\/|$)/); // /<page>/videos/123/
      if (m && m[1]) return m[1];
    } catch {}
    return null;
  }
  function findFacebookVideoIdInHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    const a = div.querySelector('a[href*="facebook.com/watch"], a[href*="facebook.com/"], a[href*="/videos/"]');
    if (a?.href) {
      const id = extractFacebookVideoId(a.href);
      if (id) return id;
    }
    const iframe = div.querySelector('iframe[src*="facebook.com"]');
    if (iframe?.src) {
      const id = extractFacebookVideoId(iframe.src);
      if (id) return id;
    }
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

  // ---------- Vimeo helpers ----------
  function extractVimeoId(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./,'');
      if (!/vimeo\.com$/i.test(host) && !/player\.vimeo\.com$/i.test(host) && !host.includes("vimeo.com")) return null;
      let m = u.pathname.match(/\/video\/(\d+)(?:\/|$)/); // player.vimeo.com/video/ID
      if (m && m[1]) return m[1];
      m = u.pathname.match(/\/(\d+)(?:\/|$)/); // vimeo.com/ID
      if (m && m[1]) return m[1];
    } catch {}
    return null;
  }
  function findVimeoIdInHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    const a = div.querySelector('a[href*="vimeo.com"]');
    if (a?.href) {
      const id = extractVimeoId(a.href);
      if (id) return id;
    }
    const iframe = div.querySelector('iframe[src*="vimeo.com"]');
    if (iframe?.src) {
      const id = extractVimeoId(iframe.src);
      if (id) return id;
    }
    const text = div.textContent || "";
    const m = text.match(/https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)/i);
    if (m && m[1]) return m[1];
    return null;
  }
  function vimeoPlayerUrl(id) { return `https://player.vimeo.com/video/${id}`; }
  function vimeoThumbUrl(id) { return `https://vumbnail.com/${id}.jpg`; }

  // ---------- Aggressive scrubbers (kill blank clickable blocks) ----------
  function scrubBlankFacebookBlocks(scope) {
    const host = scope || document;
    host.querySelectorAll("p, div, figure").forEach((el) => {
      if (el.querySelector("img, iframe, video, .embed-fallback, .btn")) return;
      const anchors = Array.from(el.querySelectorAll('a[href]'))
        .filter(a => /facebook\.com|fb\.watch/i.test(a.getAttribute('href') || ''));
      if (anchors.length !== 1) return;

      const clone = el.cloneNode(true);
      const a = clone.querySelector('a[href*="facebook.com"], a[href*="fb.watch"]');
      if (a) a.remove();
      if ((clone.textContent || '').trim() !== '') return;

      const href = anchors[0].getAttribute('href') || '#';
      const box = document.createElement("div");
      box.className = "embed-fallback";
      box.innerHTML = `
        <div class="center" style="margin:12px 0;padding:16px;border:1px solid #ddd;border-radius:10px;background:#fafafa">
          <div style="margin-bottom:8px;">This Facebook video can’t be embedded here.</div>
          <a class="btn" href="${href}" target="_blank" rel="noopener">Open on Facebook</a>
        </div>
      `;
      el.replaceWith(box);
    });
  }
  function scrubBlankVimeoBlocks(scope) {
    const host = scope || document;
    host.querySelectorAll("p, div, figure").forEach((el) => {
      if (el.querySelector("img, iframe, video, .embed-fallback, .btn")) return;
      const anchors = Array.from(el.querySelectorAll('a[href]'))
        .filter(a => /vimeo\.com/i.test(a.getAttribute('href') || ''));
      if (anchors.length !== 1) return;

      const clone = el.cloneNode(true);
      const a = clone.querySelector('a[href*="vimeo.com"]');
      if (a) a.remove();
      if ((clone.textContent || '').trim() !== '') return;

      const href = anchors[0].getAttribute('href') || '#';
      let thumb = "";
      try {
        const id = extractVimeoId(href);
        if (id) thumb = `<img src="${vimeoThumbUrl(id)}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:10px" onerror="this.remove()">`;
      } catch {}
      const box = document.createElement("div");
      box.className = "embed-fallback";
      box.innerHTML = `
        <div class="center" style="margin:12px 0;padding:16px;border:1px solid #ddd;border-radius:10px;background:#fafafa">
          ${thumb}
          <div style="margin-bottom:8px;">This Vimeo video can’t be embedded here.</div>
          <a class="btn" href="${href}" target="_blank" rel="noopener">Open on Vimeo</a>
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

  // Home (Infinite Scroll + button fallback)
  function renderHome({ search = "" } = {}) {
    try { window.__okInfObs?.disconnect(); } catch {}
    window.__okInfObs = null;

    app.innerHTML = `
      <h1>Latest Posts</h1>
      <div id="grid" class="grid"></div>
      <div class="center" style="margin:12px 0;">
        <button id="loadMore" class="btn">Load more</button>
      </div>
      <!-- sentinel triggers infinite scrolling when visible -->
      <div id="sentinel" style="height:1px;"></div>
    `;

    const grid = document.getElementById("grid");
    const loadMore = document.getElementById("loadMore");
    const sentinel = document.getElementById("sentinel");

    let page = 1;
    let totalPages = 1;
    let loading = false;
    const seen = new Set();

    async function load() {
      if (loading) return;
      loading = true;
      if (loadMore) { loadMore.disabled = true; loadMore.textContent = "Loading…"; }

      try {
        const { posts, totalPages: tp } = await fetchPosts({ page, search });
        totalPages = tp || 1;

        for (const p of posts) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);

          // Media: featured image, first <img>, Facebook/Vimeo thumbnail
          let media =
            featuredImage(p) ||
            firstImgFromHTML(p.content?.rendered) ||
            firstImgFromHTML(p.excerpt?.rendered) || "";
          if (!media) {
            const fbId = findFacebookVideoIdInHtml(p.content?.rendered || p.excerpt?.rendered || "");
            if (fbId) media = fbVideoThumbUrl(fbId);
          }
          if (!media) {
            const vmId = findVimeoIdInHtml(p.content?.rendered || p.excerpt?.rendered || "");
            if (vmId) media = vimeoThumbUrl(vmId);
          }

          const author = esc(getAuthor(p));
          const date = ordinalDate(p.date);

          const el = document.createElement("div");
          el.className = "card";
          el.innerHTML = `
            ${ media
                ? `<a href="#/post/${p.id}"><img class="thumb" src="${media}" alt=""></a>`
                : `<a href="#/post/${p.id}"><div class="thumb"></div></a>` }
            <div class="card-body">
              <h2 class="title">
                <a href="#/post/${p.id}" style="color:inherit;text-decoration:none;">
                  ${p.title.rendered}
                </a>
              </h2>
              <div class="meta-author-date">
                ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
                <span class="date">${date}</span>
              </div>
              <div class="excerpt">${p.excerpt.rendered}</div>
              <a class="btn" href="#/post/${p.id}">Read more</a>
            </div>
          `;
          grid.appendChild(el);

          // Collapse broken thumbs to placeholder
          const t = el.querySelector("img.thumb");
          if (t) {
            t.addEventListener("error", () => {
              const a = t.closest("a");
              if (a) a.innerHTML = `<div class="thumb"></div>`;
            }, { once: true });
          }
          // Ensure links in excerpts open in a new tab
          hardenLinks(el.querySelector(".excerpt"));
        }

        page++;
        const done = page > totalPages;
        if (done) {
          if (loadMore) { loadMore.textContent = "No more posts."; loadMore.disabled = true; }
          if (window.__okInfObs) window.__okInfObs.disconnect();
        } else {
          if (loadMore) { loadMore.textContent = "Load more"; loadMore.disabled = false; }
        }
      } catch (e) {
        showError(`Failed to load posts: ${e.message || e}`);
        if (loadMore) { loadMore.textContent = "Retry"; loadMore.disabled = false; }
      } finally { loading = false; }
    }

    // Button fallback
    loadMore?.addEventListener("click", load);

    // Infinite scroll via IntersectionObserver
    if ("IntersectionObserver" in window && sentinel) {
      const obs = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (page <= totalPages && !loading) load();
          }
        }
      }, { root: null, rootMargin: "600px 0px 600px 0px", threshold: 0 });
      obs.observe(sentinel);
      window.__okInfObs = obs;
      // initial load
      load();
    } else {
      // Old browsers: show button and load first page
      load();
    }
  }

  // Post detail (normalize + FB/Vimeo thumbnail fallback + final scrubs)
  async function renderPost(id) {
    app.innerHTML = `<p class="center">Loading post…</p>`;
    try {
      const p = await fetchPost(id);
      if (!p) return;

      // Exclude Cartoon posts
      if (hasExcluded(p)) {
        app.innerHTML = `<div class="error-banner"><button class="close">×</button>This post is not available.</div>`;
        return;
      }

      const author = esc(getAuthor(p));
      const date = ordinalDate(p.date);
      const tags = getTags(p._embedded?.["wp:term"]) || [];

      const rawHtml = p.content?.rendered || "";
      const normalizedHtml = normalizeContent(rawHtml);

      // Hero: featured image, first <img>, Facebook/Vimeo thumbnail
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

      hardenLinks(document.querySelector(".post"));

      // Scrub any leftover blank FB/Vimeo-only blocks
      const scope = document.querySelector(".post");
      scrubBlankFacebookBlocks(scope);
      scrubBlankVimeoBlocks(scope);

      // If hero image fails, remove to avoid blank box
      const heroImg = document.querySelector(".post img.hero");
      if (heroImg) heroImg.addEventListener("error", () => heroImg.remove(), { once: true });

    } catch (e) {
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Error loading post: ${e.message || e}</div>`;
    }
  }
  // Self-check to catch partial/omitted builds early
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

  // Router + handlers
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

  // Wire up
  window.addEventListener("hashchange", router);
  window.addEventListener("load", () => { try { selfCheck(); router(); } catch {} });
  window.addEventListener("error", (e) => showError(`Runtime error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) =>
    showError(`Unhandled promise rejection: ${e.reason?.message || e.reason}`)
  );
})();
