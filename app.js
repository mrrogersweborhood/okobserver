// app.js — OkObserver (v1.36.0 — infinite scroll + FB embed normalization)
const APP_VERSION = "v1.36.0";
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
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;" 
  }[c]));
  const getAuthor = (p) => p?._embedded?.author?.[0]?.name || "";
  const hasExcluded = (p) => (p?._embedded?.["wp:term"]?.[0] || [])
      .some(c => (c?.name || "").toLowerCase() === EXCLUDE_CAT);
  const getTags = (emb) => (emb?.flat() || []).filter(t => t?.taxonomy === "post_tag");

  function ordinalDate(iso) {
    const d = new Date(iso); 
    const day = d.getDate();
    const suf = (n)=> (n>3 && n<21)?"th":(["th","st","nd","rd"][Math.min(n%10,4)]||"th");
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
      a.target="_blank"; 
      a.rel="noopener"; 
    });
  }

  // NEW: Normalize problematic embed blocks (esp. Facebook) to a visible fallback
  function normalizeContent(html) {
    const root = document.createElement("div");
    root.innerHTML = html || "";

    // Replace Facebook embeds/wrappers with a clear fallback button
    const fbSelectors = [
      'iframe[src*="facebook.com"]',
      '.wp-block-embed-facebook',
      '.wp-block-embed__wrapper a[href*="facebook.com"]',
      '.wp-block-embed a[href*="facebook.com"]'
    ];
    root.querySelectorAll(fbSelectors.join(",")).forEach((node) => {
      let url = null;
      if (node.tagName === "IFRAME") {
        url = node.src;
      } else if (node.tagName === "A") {
        url = node.href;
      } else {
        const a = node.querySelector('a[href*="facebook.com"]');
        if (a) url = a.href;
      }

      const box = document.createElement("div");
      box.className = "embed-fallback";
      box.innerHTML = `
        <div class="center" style="margin:12px 0;padding:16px;border:1px solid #ddd;border-radius:10px;background:#fafafa">
          <div style="margin-bottom:8px;">This video can’t be embedded here.</div>
          ${url ? `<a class="btn" href="${url}" target="_blank" rel="noopener">Open on Facebook</a>` : ""}
        </div>
      `;

      const wrapper = node.closest(".wp-block-embed, .wp-block-embed__wrapper") || node;
      wrapper.replaceWith(box);
    });

    // Clean up any empty embed wrappers that still reserve space
    root.querySelectorAll(".wp-block-embed, .wp-block-embed__wrapper").forEach((el) => {
      if (!el.querySelector("iframe, a, img, video")) el.remove();
    });

    return root.innerHTML;
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

  // Home (with Infinite Scroll + button fallback)
  function renderHome({ search = "" } = {}) {
    // Disconnect any prior observer (when navigating back from a post)
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
      if (loadMore) {
        loadMore.disabled = true;
        loadMore.textContent = "Loading…";
      }

      try {
        const { posts, totalPages: tp } = await fetchPosts({ page, search });
        totalPages = tp || 1;

        for (const p of posts) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);

          const media =
            featuredImage(p) ||
            firstImgFromHTML(p.content?.rendered) ||
            firstImgFromHTML(p.excerpt?.rendered) ||
            "";

          const author = esc(getAuthor(p));
          const date = ordinalDate(p.date);

          const el = document.createElement("div");
          el.className = "card";
          el.innerHTML = `
            ${
              media
                ? `<a href="#/post/${p.id}"><img class="thumb" src="${media}" alt=""></a>`
                : `<a href="#/post/${p.id}"><div class="thumb"></div></a>`
            }
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

          const t = el.querySelector("img.thumb");
          if (t) {
            t.addEventListener(
              "error",
              () => {
                const a = t.closest("a");
                if (a) a.innerHTML = `<div class="thumb"></div>`;
              },
              { once: true }
            );
          }
          hardenLinks(el.querySelector(".excerpt"));
        }

        page++;

        const done = page > totalPages;
        if (done) {
          if (loadMore) {
            loadMore.textContent = "No more posts.";
            loadMore.disabled = true;
          }
          if (window.__okInfObs) window.__okInfObs.disconnect();
        } else {
          if (loadMore) {
            loadMore.textContent = "Load more";
            loadMore.disabled = false;
          }
        }
      } catch (e) {
        showError(`Failed to load posts: ${e.message || e}`);
        if (loadMore) {
          loadMore.textContent = "Retry";
          loadMore.disabled = false;
        }
      } finally {
        loading = false;
      }
    }

    // Button fallback
    loadMore?.addEventListener("click", load);

    // Infinite scroll via IntersectionObserver
    if ("IntersectionObserver" in window && sentinel) {
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              if (page <= totalPages && !loading) load();
            }
          }
        },
        { root: null, rootMargin: "600px 0px 600px 0px", threshold: 0 }
      );
      obs.observe(sentinel);
      window.__okInfObs = obs;
      // initial load
      load();
    } else {
      // Old browsers: show button and load first page
      load();
    }
  }
  // Post detail (uses normalizeContent to fix FB embeds)
  async function renderPost(id) {
    app.innerHTML = `<p class="center">Loading post…</p>`;
    try {
      const p = await fetchPost(id);
      if (!p) return;

      // Exclusion guard
      if (hasExcluded(p)) {
        app.innerHTML = `<div class="error-banner"><button class="close">×</button>This post is not available.</div>`;
        return;
      }

      const author = esc(getAuthor(p));
      const date = ordinalDate(p.date);
      const tags = getTags(p._embedded?.["wp:term"]) || [];

      // Normalize content to replace blocked/blank FB embeds with a visible fallback
      const rawHtml = p.content?.rendered || "";
      const normalizedHtml = normalizeContent(rawHtml);

      // Pick a hero image from featured media or first image in normalized content
      const hero = featuredImage(p) || firstImgFromHTML(normalizedHtml) || "";

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
                  .map(
                    (t) =>
                      `<a class="tag-chip" href="https://okobserver.org/tag/${t.slug}/" target="_blank" rel="noopener">${esc(
                        t.name
                      )}</a>`
                  )
                  .join("")}</div>`
              : ""
          }
          <p><a href="#/" class="btn" style="margin-top:16px">← Back to posts</a></p>
        </article>
      `;

      // Make links in post body open in a new tab
      hardenLinks(document.querySelector(".post"));
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
