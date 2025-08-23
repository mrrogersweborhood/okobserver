// app.js — OkObserver app logic (v1.7)
const APP_VERSION = "v1.7";
window.APP_VERSION = APP_VERSION;

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT_NAME = "cartoon"; // case-insensitive match

  const app = document.getElementById("app");

  // Error banner helper
  const showError = function (message) {
    if (!app) return;
    const text = (message && message.message) ? message.message : String(message || "Something went wrong.");
    const banner = document.createElement("div");
    banner.className = "error-banner";
    banner.innerHTML = `
      <button class="close" aria-label="Dismiss error" title="Dismiss">×</button>
      ${text}
    `;
    app.prepend(banner);
  };

  // Escape HTML
  const esc = (s) =>
    (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const getAuthorName = (post) =>
    post?._embedded?.author?.[0]?.name ? String(post._embedded.author[0].name) : "";

  const hasExcludedCategory = (post) => {
    const cats = post?._embedded?.["wp:term"]?.[0] || [];
    return cats.some((c) => (c?.name || "").toLowerCase() === EXCLUDE_CAT_NAME);
  };

  const getPostTags = (embeddedTerms) => {
    if (!embeddedTerms || !Array.isArray(embeddedTerms)) return [];
    return embeddedTerms.flat().filter((t) => t?.taxonomy === "post_tag");
  };

  // --- Category ID lookup & cache ---
  let excludeCategoryId = null;
  let catLookupInFlight = null;

  async function getExcludeCategoryId() {
    if (excludeCategoryId !== null) return excludeCategoryId;
    if (catLookupInFlight) return catLookupInFlight;

    const url = `${BASE}/categories?search=${encodeURIComponent(EXCLUDE_CAT_NAME)}&per_page=100`;
    catLookupInFlight = fetch(url)
      .then((r) => r.json())
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

  // --- AbortControllers ---
  let listController = null;
  let itemController = null;

  function abortList() { if (listController) listController.abort(); }
  function abortItem() { if (itemController) itemController.abort(); }

  async function fetchPosts({ page = 1, search = "" } = {}) {
    abortList();
    listController = new AbortController();
    let catId = await getExcludeCategoryId().catch(() => undefined);
    const url = buildPostsUrl({ page, search }, catId);

    try {
      const res = await fetch(url, { signal: listController.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const posts = await res.json();
      return posts.filter((p) => !hasExcludedCategory(p));
    } catch (err) {
      if (err.name === "AbortError") return [];
      showError(`Failed to load posts: ${err.message}`);
      return [];
    } finally {
      listController = null;
    }
  }

  async function fetchPostById(id) {
    abortItem();
    itemController = new AbortController();
    try {
      const res = await fetch(`${BASE}/posts/${id}?_embed=1`, { signal: itemController.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (err.name === "AbortError") return null;
      throw err;
    } finally {
      itemController = null;
    }
  }

  // --- Render Home ---
  function renderHome({ search = "" } = {}) {
    app.innerHTML = `
      <h1>Latest Posts</h1>
      <div id="grid" class="grid"></div>
      <div class="center"><button id="loadMore" class="btn">Load more</button></div>
    `;

    const grid = document.getElementById("grid");
    let page = 1, loading = false;

    async function load() {
      if (loading) return;
      loading = true;
      try {
        const posts = await fetchPosts({ page, search });
        posts.forEach((p) => {
          const media = p._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
          const author = esc(getAuthorName(p));
          const date = new Date(p.date).toLocaleDateString();
          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML = `
            ${ media
                ? `<a href="#/post/${p.id}"><img class="thumb" src="${media}" alt=""></a>`
                : `<a href="#/post/${p.id}"><div class="thumb"></div></a>` }
            <div class="card-body">
              <h2 class="title">${p.title.rendered}</h2>
              <div class="meta-author-date">
                ${author ? `<span class="author">${author}</span>` : ""}<span class="date">${date}</span>
              </div>
              <div class="excerpt">${p.excerpt.rendered}</div>
              <a href="#/post/${p.id}" class="btn">Read more</a>
            </div>
          `;
          grid.appendChild(card);
        });
        page++;
        if (!posts.length) document.getElementById("loadMore").disabled = true;
      } catch (e) {
        showError(e);
      } finally { loading = false; }
    }

    document.getElementById("loadMore").onclick = load;
    load();
  }

  // --- Render Post ---
  async function renderPost(id) {
    app.innerHTML = `<p class="center">Loading post…</p>`;
    try {
      const p = await fetchPostById(id);
      if (!p) return;
      if (hasExcludedCategory(p)) {
        showError("This post is not available.");
        return;
      }

      const author = esc(getAuthorName(p));
      const date = new Date(p.date).toLocaleDateString();
      const tags = getPostTags(p._embedded?.["wp:term"]);
      const tagsHtml = tags.length
        ? `<div class="tags"><span>Tags:</span>${tags.map(t =>
            `<a class="tag-chip" href="https://okobserver.org/tag/${t.slug}/" target="_blank">${esc(t.name)}</a>`
          ).join("")}</div>` : "";
      const hero = p._embedded?.["wp:featuredmedia"]?.[0]?.source_url
        ? `<img class="hero" src="${p._embedded["wp:featuredmedia"][0].source_url}" alt="">` : "";

      app.innerHTML = `
        <article class="post">
          <p><a href="#/" class="btn">← Back to posts</a></p>
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">${author ? `<span>${author}</span>` : ""}<span>${date}</span></div>
          ${hero}
          <div class="content">${p.content.rendered}</div>
          ${tagsHtml}
          <p><a href="#/" class="btn">← Back to posts</a></p>
        </article>
      `;
    } catch (err) {
      showError(`Error loading post: ${err.message}`);
    }
  }

  // --- Router ---
  function router() {
    const hash = location.hash || "#/";
    if (hash === "#/" || hash === "") { abortItem(); renderHome(); return; }
    if (hash.startsWith("#/post/")) { abortList(); renderPost(hash.split("/")[2]); return; }
    if (hash.startsWith("#/search")) {
      abortItem();
      const q = decodeURIComponent((hash.split("?q=")[1] || "").trim());
      renderHome({ search: q });
      return;
    }
    showError("Page not found");
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("load", router);

  // Global error handlers
  window.addEventListener("error", (e) => showError(`Runtime error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => {
    showError(`Unhandled promise rejection: ${e.reason?.message || e.reason}`);
  });
})();
