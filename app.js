// app.js — OkObserver app logic (v1.11)
// Changes: Added <strong> wrappers for author and date text, in addition to CSS bold.
// Still includes: Infinite scroll, HomeCache, AbortController, Cartoon exclusion,
// clickable image+title, pretty ordinal dates, tags, error banners, simple About.
const APP_VERSION = "v1.11";
window.APP_VERSION = APP_VERSION;

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT_NAME = "cartoon";

  const app = document.getElementById("app");

  // ------- Error banner helper -------
  const showError = (message) => {
    if (!app) return;
    const text = (message && message.message) ? message.message : String(message || "Something went wrong.");
    const banner = document.createElement("div");
    banner.className = "error-banner";
    banner.innerHTML = `<button class="close" aria-label="Dismiss error" title="Dismiss">×</button>${text}`;
    app.prepend(banner);
  };

  // ------- Utilities -------
  const esc = (s) =>
    (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const getAuthorName = (post) => post?._embedded?.author?.[0]?.name ? String(post._embedded.author[0].name) : "";
  const hasExcludedCategory = (post) => {
    const cats = post?._embedded?.["wp:term"]?.[0] || [];
    return cats.some((c) => (c?.name || "").toLowerCase() === EXCLUDE_CAT_NAME);
  };
  const getPostTags = (embeddedTerms) => {
    if (!embeddedTerms || !Array.isArray(embeddedTerms)) return [];
    return embeddedTerms.flat().filter((t) => t?.taxonomy === "post_tag");
  };

  // Pretty date formatter
  function formatDateWithOrdinal(dateString) {
    const d = new Date(dateString);
    const day = d.getDate();
    const month = d.toLocaleString("en-US", { month: "long" });
    const year = d.getFullYear();

    const suffix = (day) => {
      if (day > 3 && day < 21) return "th";
      switch (day % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
      }
    };

    return `${month} ${day}${suffix(day)}, ${year}`;
  }

  // ------- Home view cache -------
  const HomeCache = { html: "", scrollY: 0, hasData: false, search: "", page: 1 };

  // ------- Category ID lookup -------
  let excludeCategoryId = null;
  let catLookupInFlight = null;
  async function getExcludeCategoryId() {
    if (excludeCategoryId !== null) return excludeCategoryId;
    if (catLookupInFlight) return catLookupInFlight;
    const url = `${BASE}/categories?search=${encodeURIComponent(EXCLUDE_CAT_NAME)}&per_page=100`;
    catLookupInFlight = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((cats) => {
        const match = (cats || []).find((c) => (c?.name || "").toLowerCase() === EXCLUDE_CAT_NAME);
        excludeCategoryId = match ? match.id : undefined;
        return excludeCategoryId;
      })
      .catch(() => undefined);
    return catLookupInFlight;
  }

  function buildPostsUrl({ page = 1, search = "" } = {}, catId) {
    const params = new URLSearchParams();
    params.set("_embed", "1");
    params.set("per_page", String(PER_PAGE));
    params.set("page", String(page));
    if (search) params.set("search", search);
    if (catId) params.set("categories_exclude", String(catId));
    return `${BASE}/posts?${params.toString()}`;
  }

  // ------- AbortControllers -------
  let listController = null;
  let itemController = null;
  function abortList() { if (listController) { listController.abort(); listController = null; } }
  function abortItem() { if (itemController) { itemController.abort(); itemController = null; } }

  // ------- Fetch posts -------
  async function fetchPosts({ page = 1, search = "" } = {}) {
    abortList();
    listController = new AbortController();
    const catId = await getExcludeCategoryId().catch(() => undefined);
    const url = buildPostsUrl({ page, search }, catId);

    try {
      const res = await fetch(url, { signal: listController.signal });
      if (!res.ok) {
        if (res.status === 400) return { posts: [], totalPages: 1 };
        throw new Error(`HTTP ${res.status}`);
      }
      const totalPages = Number(res.headers.get("X-WP-TotalPages") || "1");
      const items = await res.json();
      const posts = items.filter((p) => !hasExcludedCategory(p));
      return { posts, totalPages };
    } catch (err) {
      if (err.name === "AbortError") return { posts: [], totalPages: 1 };
      showError(`Failed to load posts: ${err?.message || err}`);
      return { posts: [], totalPages: 1 };
    } finally { listController = null; }
  }

  async function fetchPostById(id) {
    abortItem();
    itemController = new AbortController();
    const url = `${BASE}/posts/${id}?_embed=1`;
    try {
      const res = await fetch(url, { signal: itemController.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (err.name === "AbortError") return null;
      throw err;
    } finally { itemController = null; }
  }

  const seenIds = new Set();

  // ------- Render Home -------
  function renderHome({ search = "" } = {}) {
    const state = window._homeState = { search, page: 1, totalPages: Infinity, loading: false, ended: false };
    seenIds.clear();

    app.innerHTML = `
      <h1>Latest Posts</h1>
      <div id="grid" class="grid"></div>
      <div id="status" class="center" style="margin:10px 0; font-size:.9em;"></div>
      <div id="sentinel" style="height:1px;"></div>
    `;

    const grid = document.getElementById("grid");
    const statusEl = document.getElementById("status");
    const sentinel = document.getElementById("sentinel");
    const setStatus = (msg) => { statusEl.textContent = msg || ""; };

    async function loadNextBatch(targetCount = PER_PAGE) {
      if (state.loading || state.ended) return;
      state.loading = true;
      setStatus("Loading…");

      try {
        let added = 0;
        while (added < targetCount && !state.ended) {
          const { posts, totalPages } = await fetchPosts({ page: state.page, search: state.search });
          if (state.totalPages === Infinity) state.totalPages = totalPages || 1;

          for (const p of posts) {
            if (seenIds.has(p.id)) continue;
            seenIds.add(p.id);

            const media = p._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
            const author = esc(getAuthorName(p));
            const date = formatDateWithOrdinal(p.date);

            const card = document.createElement("div");
            card.className = "card";
            card.innerHTML = `
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
                  <span class="date"><strong>${date}</strong></span>
                </div>
                <div class="excerpt">${p.excerpt.rendered}</div>
                <a href="#/post/${p.id}" class="btn">Read more</a>
              </div>
            `;
            grid.appendChild(card);
            added++;
          }

          state.page++;
          if (state.page > state.totalPages) state.ended = true;
        }

        HomeCache.html = app.innerHTML;
        HomeCache.hasData = grid.children.length > 0;
        HomeCache.page = state.page;
        HomeCache.search = state.search;

        if (state.ended) setStatus(HomeCache.hasData ? "No more posts." : "No posts found.");
        else setStatus("");
      } catch (e) {
        showError(e);
        setStatus("Failed to load.");
      } finally { state.loading = false; }
    }

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !state.loading && !state.ended) loadNextBatch(Math.ceil(PER_PAGE/2));
      }
    }, { root: null, rootMargin: "600px 0px 600px 0px", threshold: 0 });

    io.observe(sentinel);
    loadNextBatch(PER_PAGE);
  }

  // ------- Render Post -------
  async function renderPost(id) {
    app.innerHTML = `<p class="center">Loading post…</p>`;
    try {
      const p = await fetchPostById(id);
      if (!p) return;
      if (hasExcludedCategory(p)) {
        app.innerHTML = `<div class="error-banner"><button class="close">×</button>This post is not available.</div>`;
        return;
      }

      const author = esc(getAuthorName(p));
      const date = formatDateWithOrdinal(p.date);
      const tags = getPostTags(p._embedded?.["wp:term"]);
      const tagsHtml = tags.length
        ? `<div class="tags"><span style="margin-right:6px;">Tags:</span>${tags.map((t) => {
            const name = esc(t.name || "tag");
            const slug = t.slug || "";
            const href = slug ? `https://okobserver.org/tag/${slug}/` : "#";
            return `<a class="tag-chip" href="${href}" target="_blank" rel="noopener">${name}</a>`;
          }).join("")}</div>` : "";

      const hero = p._embedded?.["wp:featuredmedia"]?.[0]?.source_url
        ? `<img class="hero" src="${p._embedded["wp:featuredmedia"][0].source_url}" alt="">`
        : "";

      app.innerHTML = `
        <article class="post">
          <p><a href="#/" class="btn" style="margin-bottom:12px">← Back to posts</a></p>
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">
            ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
            <span class="date"><strong>${date}</strong></span>
          </div>
          ${hero}
          <div class="content">${p.content.rendered}</div>
          ${tagsHtml}
          <p><a href="#/" class="btn" style="margin-top:16px">← Back to posts</a></p>
        </article>
      `;
    } catch (err) {
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Error loading post: ${err?.message || err}</div>`;
    }
  }

  // ------- Simple About -------
  function renderAbout(){
    app.innerHTML = `
      <article class="post">
        <h1>About</h1>
        <p><strong>OkObserver</strong> is an unofficial reader for okobserver.org.</p>
        <p>For official info, visit <a href="https://okobserver.org" target="_blank" rel="noopener">okobserver.org</a>.</p>
      </article>
    `;
  }

  // ------- Router -------
  function router() {
    const hash = location.hash || "#/";

    if (hash === "#/" || hash === "") {
      if (HomeCache.hasData && HomeCache.html) {
        app.innerHTML = HomeCache.html;
        requestAnimationFrame(() => window.scrollTo(0, HomeCache.scrollY || 0));
        return;
      }
      abortItem();
      renderHome({ search: HomeCache.search || "" });
      return;
    }

    if (hash.startsWith("#/post/")) {
      if (app && app.querySelector("#grid")) {
        HomeCache.scrollY = window.scrollY;
        HomeCache.html = app.innerHTML;
        HomeCache.hasData = true;
      }
      abortList();
      renderPost(hash.split("/")[2]);
      return;
    }

    if (hash.startsWith("#/search")) {
      abortItem();
      const q = decodeURIComponent((hash.split("?q=")[1] || "").trim());
      HomeCache.html = ""; HomeCache.hasData = false; HomeCache.search = q;
      renderHome({ search: q }); return;
    }

    if (hash === "#/about") { abortList(); abortItem(); renderAbout(); return; }

    app.innerHTML = `<div class="error-banner"><button class="close">×</button>Page not found</div>`;
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("load", router);

  window.addEventListener("error", (e) => showError(`Runtime error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => showError(`Unhandled promise rejection: ${e.reason?.message || e.reason}`));
})();
