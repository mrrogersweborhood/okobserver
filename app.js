// app.js — OkObserver app logic (v1.7)
const APP_VERSION = "v1.7";
window.APP_VERSION = APP_VERSION;

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT_NAME = "cartoon"; // case-insensitive match

  const app = document.getElementById("app");

  // Use the page's showError if present; otherwise define a minimal one
  const showError = window.showError || function (message) {
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

  // --- Utilities ---
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
    // embeddedTerms is an array of term arrays (categories, tags, etc.)
    return embeddedTerms.flat().filter((t) => t?.taxonomy === "post_tag");
  };

  // --- Category ID lookup & cache (to exclude at API level) ---
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
        const match = (cats || []).find((c) => (c?.name || "").toLowerCase() === EXCLUDE_CAT_NAME);
        excludeCategoryId = match ? match.id : undefined;
        return excludeCategoryId;
      })
      .catch(() => {
        excludeCategoryId = undefined; // don't retry immediately; still filter client-side
        return excludeCategoryId;
      });

    return catLookupInFlight;
  }

  function buildPostsUrl({ page = 1, search = "" } = {}, catId) {
    const params = new URLSearchParams();
    params.set("_embed", "1");
    params.set("per_page", String(PER_PAGE));
    params.set("page", String(page));
    if (search) params.set("search", search);
    if (catId) params.set("categories_exclude", String(catId)); // server-side filter if we know the ID
    return `${BASE}/posts?${params.toString()}`;
  }

  // --- AbortController per fetch to prevent stale UI updates ---
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
      const posts = await res.json();

      // Fail-safe client-side filter as well
      return posts.filter((p) => !hasExcludedCategory(p));
    } catch (err) {
      if (err && err.name === "AbortError") return [];
      showError(`Failed to load posts: ${err?.message || err}`);
      return [];
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
      const p = await res.json();
      return p;
    } catch (err) {
      if (err && err.name === "AbortError") return null;
      throw err;
    } finally {
      itemController = null;
    }
  }

  // --- Renderers ---
  function renderHome({ search = "" } = {}) {
    if (!app) return;
    app.innerHTML = `
      <h1 style="margin:6px 0 16px">Latest Posts</h1>
      <div id="grid" class="grid"></div>
      <div class="center" style="margin:20px 0 30px">
        <button id="loadMore" class="btn">Load more</button>
      </div>
    `;

    const grid = document.getElementById("grid");
    let page = 1;
    let loading = false;

    async function load() {
      if (loading) return;
      loading = true;
      try {
        const posts = await fetchPosts({ page, search });
        // Render cards
        posts.forEach((p) => {
          const media = p._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
          const titleText = p.title?.rendered?.replace(/<[^>]*>/g, "") || "Post image";
          const author = esc(getAuthorName(p));
          const date = new Date(p.date).toLocaleDateString();

          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML = `
            ${
              media
                ? `<a href="#/post/${p.id}"><img class="thumb" src="${media}" alt="${titleText}"></a>`
                : `<a href="#/post/${p.id}"><div class="thumb" role="img" aria-label="${titleText}"></div></a>`
            }
            <div class="card-body">
              <h2 class="title">${p.title.rendered}</h2>
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

        page++;
        if (posts.length === 0) {
          const btn = document.getElementById("loadMore");
          if (btn) btn.disabled = true;
        }
      } catch (e) {
        // Surface error inline
        app.innerHTML = `<div class="error-banner">
          <button class="close" aria-label="Dismiss error" title="Dismiss">×</button>
          Failed to load posts. ${e?.message || e}
        </div>`;
      } finally {
        loading = false;
      }
    }

    const moreBtn = document.getElementById("loadMore");
    if (moreBtn) moreBtn.onclick = load;

    // initial load
    load();
  }

  async function renderPost(id) {
    if (!app) return;
    app.innerHTML = `<p class="center">Loading post…</p>`;

    try {
      const p = await fetchPostById(id);
      if (!p) return; // aborted

      // Exclude Cartoon in detail view, too
      if (hasExcludedCategory(p)) {
        app.innerHTML = `<div class="error-banner">
          <button class="close" aria-label="Dismiss error" title="Dismiss">×</button>
          This post is not available.
        </div>`;
        return;
      }

      const author = esc(getAuthorName(p));
      const date = new Date(p.date).toLocaleDateString();
      const tags = getPostTags(p._embedded?.["wp:term"]);
      const tagsHtml = tags.length
        ? `<div class="tags"><span class="label" style="margin-right:6px;">Tags:</span>${tags
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
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">
            ${author ? `<span class="author">${author}</span>` : ""}
            <span class="date">${date}</span>
          </div>
          ${hero}
          <div class="content">${p.content.rendered}</div>
          ${tagsHtml}
          <p><a href="#/" class="btn" style="margin-top:16px">Back to posts</a></p>
        </article>
      `;
    } catch (err) {
      app.innerHTML = `<div class="error-banner">
        <button class="close" aria-label="Dismiss error" title="Dismiss">×</button>
        Error loading post: ${err?.message || err}
      </div>`;
    }
  }

  // (Optional) Search route support (keeps Cartoon excluded)
  function parseSearchQuery(hash) {
    try {
      const qIndex = hash.indexOf("?q=");
      if (qIndex === -1) return "";
      const q = hash.substring(qIndex + 3);
      return decodeURIComponent(q || "").trim();
    } catch {
      return "";
    }
  }

  // --- Router ---
  function router() {
    const hash = location.hash || "#/";
    // Don't process #/about here (handled in index.html's routeHook)
    if (hash === "#/" || hash === "") {
      abortItem();
      renderHome();
      return;
    }
    if (hash.startsWith("#/post/")) {
      abortList();
      const id = hash.split("/")[2];
      renderPost(id);
      return;
    }
    if (hash.startsWith("#/search")) {
      abortItem();
      const q = parseSearchQuery(hash);
      renderHome({ search: q });
      return;
    }
    // Unknown route
    app.innerHTML = `<div class="error-banner">
      <button class="close" aria-label="Dismiss error" title="Dismiss">×</button>
      Page not found
    </div>`;
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("load", router);
})();
