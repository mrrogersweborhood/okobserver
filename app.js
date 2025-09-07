// app.js — OkObserver (v1.44.1 — fix featured images)
const APP_VERSION = "v1.44.1";
window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT = "cartoon";
  const app = document.getElementById("app");

  // Manual scroll restoration
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}

  // Cache (persist across refresh)
  window.__okCache = window.__okCache || {
    posts: [], page: 1, totalPages: 1, scrollY: 0,
    scrollAnchorPostId: null, searchKey: ""
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
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    const v = document.getElementById("appVersion");
    if (v) v.textContent = APP_VERSION;
  });

  // Error banner
  function showError(message) {
    const msg = (message && message.message) ? message.message : String(message || "Something went wrong.");
    const div = document.createElement("div");
    div.className = "error-banner";
    div.innerHTML = `<button class="close">×</button>${msg}`;
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
  const hasExcluded = (p) => (p?._embedded?.["wp:term"]?.[0] || [])
    .some(c => (c?.name || "").toLowerCase() === EXCLUDE_CAT);

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

  // ✅ safer featured image function
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

  function hardenLinks(root) {
    if (!root) return;
    root.querySelectorAll("a[href]").forEach(a => { a.target = "_blank"; a.rel = "noopener"; });
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
  // ===== Fetch posts with nested featured image fields =====
  async function fetchPosts({ page = 1, search = "" } = {}) {
    const fields = [
      "id",
      "date",
      "title.rendered",
      "excerpt.rendered",
      "_embedded.wp:featuredmedia.id",
      "_embedded.wp:featuredmedia.source_url",
      "_embedded.wp:featuredmedia.media_details.sizes",
      "_embedded.author.name",
      "_embedded.wp:term.name",
      "_embedded.wp:term.taxonomy"
    ].join(",");

    const url = `${BASE}/posts?_embed=1&_fields=${encodeURIComponent(fields)}&per_page=${PER_PAGE}&page=${page}${
      search ? `&search=${encodeURIComponent(search)}` : ""
    }`;

    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const totalPages = Number(res.headers.get("X-WP-TotalPages") || "1");
    const items = await res.json();
    return { posts: items.filter((p) => !hasExcluded(p)), totalPages };
  }

  // Fetch single post
  async function fetchPost(id) {
    const url = `${BASE}/posts/${id}?_embed=1`;
    const res = await fetch(url, { credentials:"omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Build card
  function buildCardElement(p) {
    let media = featuredImage(p) || firstImgFromHTML(p.excerpt?.rendered) || "";
    const author = esc(getAuthor(p));
    const date = ordinalDate(p.date);

    const el = document.createElement("div");
    el.className = "card";
    el.dataset.postId = p.id;
    el.innerHTML = `
      ${ media
          ? `<a href="#/post/${p.id}"><img class="thumb" src="${media}" alt=""></a>`
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
    hardenLinks(el.querySelector(".excerpt"));
    return el;
  }
  // Restore scroll
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

  // Render home
  async function renderHome({ search = "" } = {}) {
    const qFromHash = parseQueryFromHash();
    const effectiveSearch = (search || qFromHash || "").trim();
    const key = effectiveSearch.toLowerCase();

    if (window.__okCache.searchKey !== key) {
      window.__okCache = { posts: [], page: 1, totalPages: 1, scrollY: 0, scrollAnchorPostId: null, searchKey: key };
      saveHomeCache();
    }

    app.innerHTML = `<h1>Latest Posts</h1><div id="grid" class="grid"></div><p class="center"><button id="loadMore" class="btn">Load more</button></p>`;
    const grid = document.getElementById("grid");
    const loadMore = document.getElementById("loadMore");

    let page = window.__okCache.page || 1;
    let totalPages = window.__okCache.totalPages || 1;
    let loading = false;
    const seen = new Set();

    // Replay cache
    if (window.__okCache.posts.length) {
      const frag = document.createDocumentFragment();
      window.__okCache.posts.forEach(p => {
        if (!hasExcluded(p) && !seen.has(p.id)) { seen.add(p.id); frag.appendChild(buildCardElement(p)); }
      });
      grid.appendChild(frag);
      restoreHomeScroll();
      if (page > totalPages) { loadMore.textContent = "No more posts."; loadMore.disabled = true; }
    }

    async function load() {
      if (loading) return;
      loading = true;
      loadMore.disabled = true; loadMore.textContent = "Loading…";
      try {
        const { posts, totalPages: tp } = await fetchPosts({ page, search: effectiveSearch });
        totalPages = tp || 1;

        const frag = document.createDocumentFragment();
        for (const p of posts) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          frag.appendChild(buildCardElement(p));
          window.__okCache.posts.push(p);
        }
        grid.appendChild(frag);

        page++; window.__okCache.page = page; window.__okCache.totalPages = totalPages; saveHomeCache();

        const done = page > totalPages;
        if (done) { loadMore.textContent = "No more posts."; loadMore.disabled = true; }
        else { loadMore.textContent = "Load more"; loadMore.disabled = false; }
      } catch(e){ showError(`Failed to load posts: ${e.message}`); loadMore.textContent = "Retry"; loadMore.disabled = false; }
      finally { loading = false; }
    }

    loadMore?.addEventListener("click", load);
    if (!window.__okCache.posts.length) load();
  }
  // Render single post
  async function renderPost(id) {
    app.innerHTML = `<p class="center">Loading post…</p>`;
    try {
      const p = await fetchPost(id);
      if (!p) return;
      if (hasExcluded(p)) { app.innerHTML = `<div class="error-banner">This post is not available.</div>`; return; }

      const author = esc(getAuthor(p));
      const date = ordinalDate(p.date);

      app.innerHTML = `
        <article class="post">
          <p><a href="#/" class="btn">← Back to posts</a></p>
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">
            ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
            <span class="date">${date}</span>
          </div>
          ${featuredImage(p) ? `<img class="hero" src="${featuredImage(p)}" alt="">` : ""}
          <div class="content">${p.content?.rendered || ""}</div>
          <p><a href="#/" class="btn">← Back to posts</a></p>
        </article>`;
      hardenLinks(document.querySelector(".post"));
    } catch(e){ showError(`Error loading post: ${e.message}`); }
  }

  // Router
  function router(){
    const hash = location.hash || "#/";
    if (hash.startsWith("#/post/")) { const id = hash.split("/")[2]; renderPost(id); return; }
    renderHome({ search: parseQueryFromHash() });
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("load", router);
})();
