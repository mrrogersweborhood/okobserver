// app.js — OkObserver app logic (v1.8) — adds HomeCache for instant back navigation
const APP_VERSION = "v1.8";
window.APP_VERSION = APP_VERSION;

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT_NAME = "cartoon"; // case-insensitive

  const app = document.getElementById("app");

  // ------- Error banner helper -------
  const showError = (message) => {
    if (!app) return;
    const text =
      (message && message.message)
        ? message.message
        : String(message || "Something went wrong.");
    const banner = document.createElement("div");
    banner.className = "error-banner";
    banner.innerHTML = `
      <button class="close" aria-label="Dismiss error" title="Dismiss">×</button>
      ${text}
    `;
    app.prepend(banner);
  };

  // ------- Utilities -------
  const esc = (s) =>
    (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));

  const getAuthorName = (post) =>
    post?._embedded?.author?.[0]?.name
      ? String(post._embedded.author[0].name)
      : "";

  const hasExcludedCategory = (post) => {
    const cats = post?._embedded?.["wp:term"]?.[0] || [];
    return cats.some((c) => (c?.name || "").toLowerCase() === EXCLUDE_CAT_NAME);
  };

  const getPostTags = (embeddedTerms) => {
    if (!embeddedTerms || !Array.isArray(embeddedTerms)) return [];
    return embeddedTerms.flat().filter((t) => t?.taxonomy === "post_tag");
  };

  // ------- Home view cache (for instant back) -------
  const HomeCache = {
    html: "",
    scrollY: 0,
    hasData: false,
    search: "",
    page: 1,
  };

  // ------- Category ID lookup & cache -------
  let excludeCategoryId = null;
  let catLookupInFlight = null;

  async function getExcludeCategoryId() {
    if (excludeCategoryId !== null) return excludeCategoryId;
    if (catLookupInFlight) return catLookupInFlight;

    const url = `${BASE}/categories?search=${encodeURIComponent(EXCLUDE_CAT_NAME)}&per_page=100`;
    catLookupInFlight = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((cats) => {
        const match = (cats || []).find(
          (c) => (c?.name || "").toLowerCase() === EXCLUDE_CAT_NAME
        );
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

  function abortList() {
    if (listController) {
      listController.abort();
      listController = null;
    }
  }
  function abortItem() {
    if (itemController) {
      itemController.abort();
      itemController = null;
    }
  }

  async function fetchPosts({ page = 1, search = "" } = {}) {
    abortList();
    listController = new AbortController();

    let catId = await getExcludeCategoryId().catch(() => undefined);
    const url = buildPostsUrl({ page, search }, catId);

    try {
      const res = await fetch(url, { signal: listController.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const totalPages = Number(res.headers.get("X-WP-TotalPages") || "1");
      const items = await res.json();
      const posts = items.filter((p) => !hasExcludedCategory(p));
      return { posts, totalPages };
    } catch (err) {
      if (err && err.name === "AbortError") return { posts: [], totalPages: 1 };
      showError(`Failed to load posts: ${err?.message || err}`);
      return { posts: [], totalPages: 1 };
    } finally {
      listController = null;
    }
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
      if (err && err.name === "AbortError") return null;
      throw err;
    } finally {
      itemController = null;
    }
  }

  // ------- Render Home -------
  function renderHome({ search = "" } = {}) {
    HomeCache.search = search || "";
    HomeCache.page = 1;

    app.innerHTML = `
      <h1>Latest Posts</h1>
      <div id="grid" class="grid"></div>
      <div class="center" id="pager">
        <button id="loadMore" class="btn" aria-busy="false">Load more</button>
      </div>
    `;

    const grid = document.getElementById("grid");
    const moreBtn = document.getElementById("loadMore");

    let page = 1;
    let loading = false;
    let totalPages = Infinity;

    async function load() {
      if (loading) return;
      loading = true;
      if (moreBtn) {
        moreBtn.setAttribute("aria-busy", "true");
        moreBtn.textContent = "Loading…";
      }

      try {
        let batch = { posts: [], totalPages: totalPages === Infinity ? undefined : totalPages };
        let guard = 0;
        do {
          batch = await fetchPosts({ page, search });
          if (totalPages === Infinity) totalPages = batch.totalPages || 1;
          if (batch.posts.length === 0) page++;
          guard++;
        } while (batch.posts.length === 0 && page <= totalPages && guard < 5);

        batch.posts.forEach((p) => {
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
              <h2 class="title">
                <a href="#/post/${p.id}" style="color:inherit;text-decoration:none;">
                  ${p.title.rendered}
                </a>
              </h2>
              <div class="meta-author-date">
                ${author ? `<span class="author">${author}</span>` : ""}
                <span class="date">${date}</span>
              </div>
              <div class="excerpt">${p.excerpt.rendered}</div>
              <a href="#/post/${p.id}" class="btn">Read more</a>
            </div>
          `;
          grid.appendChild(card);
        });

        if (batch.posts.length > 0) page++;
        HomeCache.page = page;
        HomeCache.html = app.innerHTML;
        HomeCache.hasData = grid.children.length > 0;

        const noMore = page > totalPages;
        if (moreBtn) moreBtn.disabled = noMore;

        if (grid.children.length === 0 && noMore) {
          grid.innerHTML = `<p class="center">No posts found.</p>`;
        }
      } catch (e) {
        showError(e);
      } finally {
        loading = false;
        if (moreBtn) {
          moreBtn.setAttribute("aria-busy", "false");
          moreBtn.textContent = moreBtn.disabled ? "No more posts" : "Load more";
        }
      }
    }

    window._homeLoadMore = load;
    if (moreBtn) {
      moreBtn._wired = true;
      moreBtn.onclick = load;
    }

    load();
  }

  // ------- Render Post -------
  async function renderPost(id) {
    app.innerHTML = `<p class="center">Loading post…</p>`;

    try {
      const p = await fetchPostById(id);
      if (!p) return;

      if (hasExcludedCategory(p)) {
        app.innerHTML = `<div class="error-banner">
          <button class="close">×</button>
          This post is not available.
        </div>`;
        return;
      }

      const author = esc(getAuthorName(p));
      const date = new Date(p.date).toLocaleDateString();
      const tags = getPostTags(p._embedded?.["wp:term"]);
      const tagsHtml = tags.length
        ? `<div class="tags"><span style="margin-right:6px;">Tags:</span>${tags
            .map((t) => {
              const name = esc(t.name || "tag");
              const slug = t.slug || "";
              const href = slug ? `https://okobserver.org/tag/${slug}/` : "#";
              return `<a class="tag-chip" href="${href}" target="_blank" rel="noopener">${name}</a>`;
            })
            .join("")}</div>`
        : "";

      const hero = p._embedded?.["wp:featuredmedia"]?.[0]?.source_url
        ? `<img class="hero" src="${p._embedded["wp:featuredmedia"][0].source_url}" alt="">`
        : "";

      app.innerHTML = `
        <article class="post">
          <p><a href="#/" class="btn" style="margin-bottom:12px">← Back to posts</a></p>
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">
            ${author ? `<span class="author">${author}</span>` : ""}
            <span class="date">${date}</span>
          </div>
          ${hero}
          <div class="content">${p.content.rendered}</div>
          ${tagsHtml}
          <p><a href="#/" class="btn" style="margin-top:16px">← Back to posts</a></p>
        </article>
      `;
    } catch (err) {
      app.innerHTML = `<div class="error-banner">
        <button class="close">×</button>
        Error loading post: ${err?.message || err}
      </div>`;
    }
  }

  // ------- Router -------
  function router() {
    const hash = location.hash || "#/";

    if (hash === "#/" || hash === "") {
      if (HomeCache.hasData && HomeCache.html) {
        app.innerHTML = HomeCache.html;
        const moreBtn = document.getElementById("loadMore");
        if (moreBtn && !moreBtn._wired && typeof window._homeLoadMore === "function") {
          moreBtn._wired = true;
          moreBtn.onclick = window._homeLoadMore;
        }
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
      const id = hash.split("/")[2];
      renderPost(id);
      return;
    }

    if (hash.startsWith("#/search")) {
      abortItem();
      const q = decodeURIComponent((hash.split("?q=")[1] || "").trim());
      HomeCache.html = "";
      HomeCache.hasData = false;
      HomeCache.search = q;
      renderHome({ search: q });
      return;
    }

    app.innerHTML = `<div class="error-banner">
      <button class="close">×</button>
      Page not found
    </div>`;
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("load", router);

  // ------- Global error handlers -------
  window.addEventListener("error", (e) => showError(`Runtime error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => {
    showError(`Unhandled promise rejection: ${e.reason?.message || e.reason}`);
  });
})();
