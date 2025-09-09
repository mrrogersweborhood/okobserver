// app.js — OkObserver (v1.45.7 — renderHome fix: never stuck on "Loading…")
const APP_VERSION = "v1.45.7";
window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT = "cartoon";
  const app = document.getElementById("app");

  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}

  // Home cache
  window.__okCache = window.__okCache || {
    posts: [],
    page: 1,
    totalPages: 1,
    scrollY: 0,
    scrollAnchorPostId: null,
    searchKey: ""
  };
  function saveHomeCache(){ try{ sessionStorage.setItem("__okCache", JSON.stringify(window.__okCache)); }catch{} }
  (function loadHomeCache(){
    try {
      const raw = sessionStorage.getItem("__okCache");
      if (raw) {
        const val = JSON.parse(raw);
        if (val && typeof val === "object") window.__okCache = { ...window.__okCache, ...val };
      }
    } catch {}
  })();

  // Footer year + version
  window.addEventListener("DOMContentLoaded", () => {
    const y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear();
    const v = document.getElementById("appVersion"); if (v) v.textContent = APP_VERSION;
  });

  // Error banner
  function showError(message) {
    const msg = (message && message.message) ? message.message : String(message || "Something went wrong.");
    const div = document.createElement("div");
    div.className = "error-banner";
    div.innerHTML = `<button class="close" aria-label="Dismiss">×</button>${msg}`;
    app.prepend(div);
  }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".error-banner .close");
    if (btn) btn.closest(".error-banner")?.remove();
  });

  // Utils
  const esc = (s) => (s || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const getAuthor = (p) => p?._embedded?.author?.[0]?.name || "";

  function hasExcluded(p) {
    const groups = p?._embedded?.["wp:term"] || [];
    const cats = groups.flat().filter(t => (t?.taxonomy || "").toLowerCase() === "category");
    const norm = (x) => (x || "").trim().toLowerCase();
    return cats.some(c => norm(c.slug) === EXCLUDE_CAT || norm(c.name) === EXCLUDE_CAT);
  }

  function ordinalDate(iso) {
    const d = new Date(iso);
    const day = d.getDate();
    const suf = (n)=> (n>3 && n<21) ? "th" : (["th","st","nd","rd"][Math.min(n%10,4)] || "th");
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
    return (
      sizes?.["2048x2048"]?.source_url ||
      sizes?.["1536x1536"]?.source_url ||
      sizes?.large?.source_url ||
      sizes?.medium_large?.source_url ||
      sizes?.medium?.source_url ||
      m.source_url ||
      ""
    );
  }

  // External links in new tab; internal SPA links stay in-app
  function hardenLinks(root) {
    if (!root) return;
    root.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href") || "";
      const isInternal = href.startsWith("#/");
      if (isInternal) {
        a.removeAttribute("target");
        a.removeAttribute("rel");
        return;
      }
      if (/^https?:\/\//i.test(href)) {
        a.target = "_blank";
        a.rel = "noopener";
      }
    });
  }

  // Query helpers
  function parseQueryFromHash() {
    const h = location.hash || "#/";
    const qMatch = h.match(/[?&]q=([^&]+)/i);
    return qMatch ? decodeURIComponent(qMatch[1].replace(/\+/g, " ")) : "";
  }
  function setQueryInHash(q) {
    const base = "#/";
    const s = q ? `${base}?q=${encodeURIComponent(q.trim())}` : base;
    if (location.hash !== s) location.hash = s;
  }
  // ===== Content normalization & media =====
  function deLazyImages(root) {
    if (!root) return;
    root.querySelectorAll("img").forEach((img) => {
      const realSrc = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original") || "";
      const realSrcset = img.getAttribute("data-srcset") || img.getAttribute("data-lazy-srcset") || "";
      if (realSrc) img.setAttribute("src", realSrc);
      if (realSrcset) img.setAttribute("srcset", realSrcset);
      img.classList.remove("lazyload","lazy","jetpack-lazy-image");
      img.loading = "lazy"; img.decoding = "async";
      if (!img.style.maxWidth) img.style.maxWidth = "100%";
      if (!img.style.height) img.style.height = "auto";
    });
  }

  function normalizeContent(html) {
    const root = document.createElement("div");
    root.innerHTML = html || "";

    // remove empty WP embed shells
    const containers = root.querySelectorAll([
      "figure.wp-block-embed","div.wp-block-embed",".wp-block-embed-facebook",".wp-block-embed-vimeo",".wp-block-embed__wrapper"
    ].join(","));
    containers.forEach((cont) => {
      if (!cont.querySelector("iframe, a, img, video") && !cont.textContent.trim()) cont.remove();
    });

    deLazyImages(root);
    return root.innerHTML;
  }

  // ===== About page fetch & cleanup =====
  async function fetchAboutPage() {
    const url = `https://okobserver.org/wp-json/wp/v2/pages?slug=contact-about-donate&_embed=1`;
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) throw new Error("About page not found");
    return arr[0];
  }

  function stripBlankNodes(root) {
    if (!root) return;
    const isBlank = (el) => {
      const txt = (el.textContent || "").replace(/\u00A0/g, " ").trim();
      if (txt) return false;
      if (!el.children.length) return true;
      if ([...el.children].every(c => c.tagName === "BR")) return true;
      return false;
    };
    const all = root.querySelectorAll("p, div, section, figure");
    [...all].reverse().forEach(el => { if (isBlank(el)) el.remove(); });
  }

  async function renderAbout() {
    const mount = document.getElementById("app");
    mount.innerHTML = `<p class="center">Loading About…</p>`;
    try {
      const page = await fetchAboutPage();
      const title = page.title?.rendered || "About";
      const cleanedHTML = normalizeContent(page.content?.rendered || "");
      const wrapper = document.createElement("div");
      wrapper.innerHTML = cleanedHTML;

      // trim empties
      stripBlankNodes(wrapper);

      // left-align & image flow
      wrapper.querySelectorAll("p, div").forEach(el => {
        const style = (el.getAttribute("style") || "").toLowerCase();
        if (style.includes("text-align:center") || style.includes("text-align:right")) {
          el.style.textAlign = "left";
        }
      });
      wrapper.querySelectorAll("img").forEach(img => {
        img.style.display = "block";
        img.style.margin = "16px auto";
        img.style.float = "none";
        img.style.clear = "both";
        img.loading = "lazy";
        img.decoding = "async";
      });

      hardenLinks(wrapper);

      mount.innerHTML = `
        <article class="post">
          <h1>${title}</h1>
          <div class="content about-content">${wrapper.innerHTML}</div>
          <div style="margin-top:20px" class="center">
            <a class="btn" href="https://okobserver.org/contact-about-donate/" target="_blank" rel="noopener">View on okobserver.org</a>
          </div>
        </article>
      `;
    } catch (e) {
      mount.innerHTML = `
        <div class="error-banner">
          <button class="close">×</button>
          Couldn't load the About page: ${e.message}
          <div style="margin-top:10px">
            <a class="btn" target="_blank" rel="noopener" href="https://okobserver.org/contact-about-donate/">Open on okobserver.org</a>
          </div>
        </div>
      `;
    }
  }
  // ===== API =====
  async function fetchPosts({ page = 1, search = "" } = {}) {
    const url = `${BASE}/posts?_embed=1&per_page=${PER_PAGE}&page=${page}${
      search ? `&search=${encodeURIComponent(search)}` : ""
    }`;
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const totalPages = Number(res.headers.get("X-WP-TotalPages") || "1");
    const items = await res.json();
    return { posts: items.filter((p) => !hasExcluded(p)), totalPages };
  }

  async function fetchPost(id) {
    const url = `${BASE}/posts/${id}?_embed=1`;
    const res = await fetch(url, { credentials:"omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Card
  function buildCardElement(p) {
    let media = featuredImage(p) || firstImgFromHTML(p.excerpt?.rendered) || "";
    const author = esc(getAuthor(p));
    const date = ordinalDate(p.date);

    const el = document.createElement("div");
    el.className = "card";
    el.dataset.postId = p.id;
    el.innerHTML = `
      ${ media
          ? `<a href="#/post/${p.id}"><img class="thumb" src="${media}" alt="" loading="lazy" decoding="async"></a>`
          : `<a href="#/post/${p.id}"><div class="thumb"></div></a>` }
      <div class="card-body">
        <h2 class="title"><a href="#/post/${p.id}" style="color:inherit;text-decoration:none;">${p.title.rendered}</a></h2>
        <div class="meta-author-date">
          ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
          <span class="date">${date}</span>
        </div>
        <div class="excerpt">${p.excerpt.rendered}</div>
        <a class="btn" href="#/post/${p.id}">Read more</a>
      </div>`;
    const t = el.querySelector("img.thumb");
    if (t) t.addEventListener("error", () => { const a = t.closest("a"); if (a) a.innerHTML = `<div class="thumb"></div>`; }, { once:true });
    hardenLinks(el.querySelector(".excerpt"));
    return el;
  }

  // Scroll restore
  function restoreHomeScroll() {
    const cache = window.__okCache || {};
    const targetId = cache.scrollAnchorPostId;
    const targetY = cache.scrollY || 0;
    requestAnimationFrame(() => {
      if (targetId) {
        const card = document.querySelector(`.card[data-post-id="${CSS.escape(String(targetId))}"]`);
        if (card) {
          const y = Math.max(0, card.getBoundingClientRect().top + window.scrollY - 8);
          window.scrollTo(0,y); return;
        }
      }
      window.scrollTo(0,targetY);
    });
  }

  // ===== Home (robust: no stuck "Loading…") =====
  async function renderHome({ search = "" } = {}) {
    const qFromHash = parseQueryFromHash();
    const effectiveSearch = (search || qFromHash || "").trim();
    const key = effectiveSearch.toLowerCase();

    const returning = sessionStorage.getItem("__okReturning") === "1";
    const hasCacheArray = Array.isArray(window.__okCache.posts) && window.__okCache.posts.length > 0;

    // Reset cache only if search changed and not returning
    if (window.__okCache.searchKey !== key && !returning) {
      window.__okCache = { posts: [], page: 1, totalPages: 1, scrollY: 0, scrollAnchorPostId: null, searchKey: key };
      saveHomeCache();
    } else {
      window.__okCache.searchKey = key;
      saveHomeCache();
    }

    // UI
    app.innerHTML = `
      <h1 style="margin-bottom:10px;">Latest Posts</h1>
      <div style="margin:8px 0 16px 0;">
        <input id="searchBox" type="search" placeholder="Search posts…" value="${esc(effectiveSearch)}"
          style="width:100%;max-width:420px;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:1em" />
      </div>
      <div id="grid" class="grid"></div>
      <div class="center" style="margin:12px 0;"><button id="loadMore" class="btn">Load more</button></div>
      <div id="sentinel" style="height:1px;"></div>
    `;

    const grid = document.getElementById("grid");
    const loadMore = document.getElementById("loadMore");
    const sentinel = document.getElementById("sentinel");
    const searchBox = document.getElementById("searchBox");

    let page = Number(window.__okCache.page || 1);
    let totalPages = Number(window.__okCache.totalPages || 1);
    let loading = false;

    // Debounced search → update hash
    let tId = null;
    searchBox.addEventListener("input", () => {
      const val = searchBox.value.trim();
      if (tId) clearTimeout(tId);
      tId = setTimeout(() => setQueryInHash(val), 250);
    });

    // Remember which card was clicked (for Back restore)
    grid.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#/post/"]');
      if (!a) return;
      const id = a.getAttribute("href").split("/")[2]?.split("?")[0];
      if (!id) return;
      try {
        window.__okCache.scrollAnchorPostId = isNaN(+id) ? id : +id;
        window.__okCache.scrollY = window.scrollY || 0;
        window.__okCache.returningFromDetail = true;
        saveHomeCache();
        sessionStorage.setItem("__okReturning", "1");
      } catch {}
    });

    // Load page of posts
    async function load() {
      if (loading) return;
      loading = true;
      loadMore.disabled = true; loadMore.textContent = "Loading…";
      try {
        const { posts, totalPages: tp } = await fetchPosts({ page, search: effectiveSearch });
        totalPages = tp || 1;

        const frag = document.createDocumentFragment();
        posts.forEach(p => { frag.appendChild(buildCardElement(p)); window.__okCache.posts.push(p); });
        if (frag.childNodes.length) grid.appendChild(frag);

        page++;
        window.__okCache.page = page;
        window.__okCache.totalPages = totalPages;
        saveHomeCache();

        if (page > totalPages) { loadMore.textContent = "No more posts."; loadMore.disabled = true; }
        else { loadMore.textContent = "Load more"; loadMore.disabled = false; }
      } catch(e){
        showError(`Failed to load posts: ${e.message}`);
        loadMore.textContent = "Retry";
        loadMore.disabled = false;
      } finally { loading = false; }
    }

    // Always attach infinite scroll observer
    function setupInfinite() {
      if (!("IntersectionObserver" in window) || !sentinel) return;
      const obs = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !loading && page <= totalPages) load();
        }
      }, { rootMargin: "600px 0px 600px 0px" });
      obs.observe(sentinel);
    }
    setupInfinite();

    // Replay cache or load immediately
    if (hasCacheArray) {
      const frag = document.createDocumentFragment();
      window.__okCache.posts.forEach(p => frag.appendChild(buildCardElement(p)));
      grid.appendChild(frag);
      if (page > totalPages) { loadMore.textContent = "No more posts."; loadMore.disabled = true; }
      requestAnimationFrame(restoreHomeScroll);
    } else {
      if (returning) sessionStorage.removeItem("__okReturning"); // stale flag
      load(); // ensure first fetch happens
    }

    // Manual load-more button
    loadMore?.addEventListener("click", load);
  }
  // ===== Post detail =====
  async function renderPost(id) {
    try { window.__okCache.scrollY = window.scrollY || 0; saveHomeCache(); } catch {}
    try {
      window.__okCache.scrollAnchorPostId = isNaN(+id) ? id : +id;
      window.__okCache.returningFromDetail = true;
      saveHomeCache();
      sessionStorage.setItem("__okReturning", "1");
    } catch {}

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

      const rawHtml = p.content?.rendered || "";
      const normalizedHtml = normalizeContent(rawHtml);

      // Scrub WP inline text-align so first paragraph isn't centered
      const contentWrapper = document.createElement("div");
      contentWrapper.innerHTML = normalizedHtml;
      contentWrapper.querySelectorAll("p, div, li, h1, h2, h3, h4").forEach(el => {
        const style = (el.getAttribute("style") || "").toLowerCase();
        if (style.includes("text-align:center") || style.includes("text-align:right")) {
          el.style.textAlign = "left";
        }
      });
      contentWrapper.querySelectorAll("img").forEach(img => {
        img.style.display = "block";
        img.style.margin = "16px auto";
        img.style.float = "none";
        img.style.clear = "both";
        img.loading = "lazy";
        img.decoding = "async";
      });

      app.innerHTML = `
        <article class="post">
          <p><a href="#/" class="btn" style="margin-bottom:12px">← Back to posts</a></p>
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">
            ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
            <span class="date">${date}</span>
          </div>
          <div class="content">${contentWrapper.innerHTML}</div>
          <p><a href="#/" class="btn" style="margin-top:16px">← Back to posts</a></p>
        </article>`;

      // Keep SPA links internal; external open new tab
      hardenLinks(document.querySelector(".post"));

    } catch(e){
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Error loading post: ${e.message}</div>`;
    }
  }

  // ===== Router =====
  function router(){
    try{
      const hash = location.hash || "#/";
      if (hash === "#/about") { renderAbout(); return; }
      if (hash.startsWith("#/post/")) {
        const id = hash.split("/")[2]?.split("?")[0];
        renderPost(id); return;
      }
      renderHome({ search: parseQueryFromHash() });
    } catch(e){ showError(`Router crash: ${e?.message || e}`); }
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("load", router);
})();
