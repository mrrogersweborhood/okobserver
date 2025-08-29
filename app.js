// app.js — OkObserver (v1.34.2 full stable)
const APP_VERSION = "v1.34.2";
window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT = "cartoon";
  const app = document.getElementById("app");

  window.addEventListener("DOMContentLoaded", () => {
    const y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear();
    const v = document.getElementById("appVersion"); if (v) v.textContent = APP_VERSION;
  });

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

  const esc = (s) => (s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const getAuthor = (p) => p?._embedded?.author?.[0]?.name || "";
  const hasExcluded = (p) => (p?._embedded?.["wp:term"]?.[0] || []).some(c => (c?.name || "").toLowerCase() === EXCLUDE_CAT);
  const getTags = (emb) => (emb?.flat() || []).filter(t => t?.taxonomy === "post_tag");
  function ordinalDate(iso) {
    const d = new Date(iso); const day = d.getDate();
    const suf = (n)=> (n>3 && n<21)?"th":(["th","st","nd","rd"][Math.min(n%10,4)]||"th");
    return `${d.toLocaleString("en-US",{month:"long"})} ${day}${suf(day)}, ${d.getFullYear()}`;
  }
  function featuredImage(p) {
    const m = p?._embedded?.["wp:featuredmedia"]?.[0]; if (!m) return "";
    const sizes = m.media_details?.sizes || {};
    return sizes?.["2048x2048"]?.source_url || sizes?.full?.source_url || sizes?.large?.source_url ||
           sizes?.medium_large?.source_url || sizes?.medium?.source_url || m.source_url || "";
  }

  async function fetchPosts({ page=1 } = {}) {
    const url = `${BASE}/posts?_embed=1&per_page=${PER_PAGE}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const totalPages = Number(res.headers.get("X-WP-TotalPages") || "1");
    const items = await res.json();
    return { posts: items.filter(p => !hasExcluded(p)), totalPages };
  }
  async function fetchPost(id) {
    const res = await fetch(`${BASE}/posts/${id}?_embed=1`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function renderHome() {
    app.innerHTML = `
      <h1>Latest Posts</h1>
      <div id="grid" class="grid"></div>
      <div class="center" style="margin:12px 0;">
        <button id="loadMore" class="btn">Load more</button>
      </div>`;
    const grid = document.getElementById("grid");
    const loadMore = document.getElementById("loadMore");
    let page = 1, totalPages = 1, loading = false;

    async function load() {
      if (loading) return; loading = true;
      loadMore.disabled = true; loadMore.textContent = "Loading…";
      try {
        const { posts, totalPages: tp } = await fetchPosts({ page });
        totalPages = tp || 1;
        for (const p of posts) {
          const author = esc(getAuthor(p)), date = ordinalDate(p.date);
          const el = document.createElement("div");
          el.className = "card";
          el.innerHTML = `
            <a href="#/post/${p.id}"><img class="thumb" src="${featuredImage(p)}" alt=""></a>
            <div class="card-body">
              <h2 class="title"><a href="#/post/${p.id}" style="color:inherit;text-decoration:none;">${p.title.rendered}</a></h2>
              <div class="meta-author-date">
                ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
                <span class="date">${date}</span>
              </div>
              <div class="excerpt">${p.excerpt.rendered}</div>
              <a class="btn" href="#/post/${p.id}">Read more</a>
            </div>`;
          grid.appendChild(el);
        }
        page++;
        if (page > totalPages) { loadMore.textContent = "No more posts."; loadMore.disabled = true; }
        else { loadMore.textContent = "Load more"; loadMore.disabled = false; }
      } catch (e) {
        showError(`Failed to load posts: ${e.message||e}`);
        loadMore.textContent = "Retry"; loadMore.disabled = false;
      } finally { loading = false; }
    }
    loadMore.addEventListener("click", load);
    load();
  }

  async function renderPost(id) {
    app.innerHTML = `<p class="center">Loading post…</p>`;
    try {
      const p = await fetchPost(id);
      if (!p) return;
      if (hasExcluded(p)) { app.innerHTML = `<div class="error-banner"><button class="close">×</button>This post is not available.</div>`; return; }
      const author = esc(getAuthor(p)), date = ordinalDate(p.date);
      const tags = getTags(p._embedded?.["wp:term"]) || [];
      const contentHtml = p.content?.rendered || "";
      const hero = featuredImage(p);

      app.innerHTML = `
        <article class="post">
          <p><a href="#/" class="btn" style="margin-bottom:12px">← Back to posts</a></p>
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">
            ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
            <span class="date">${date}</span>
          </div>
          ${hero ? `<img class="hero" src="${hero}" alt="" loading="lazy">` : ""}
          <div class="content">${contentHtml}</div>
          ${tags.length ? `<div class="tags"><span style="margin-right:6px;">Tags:</span>${tags.map(t=>`<a class="tag-chip" href="https://okobserver.org/tag/${t.slug}/" target="_blank" rel="noopener">${esc(t.name)}</a>`).join("")}</div>`:""}
          <p><a href="#/" class="btn" style="margin-top:16px">← Back to posts</a></p>
        </article>`;
    } catch (e) {
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Error loading post: ${e.message||e}</div>`;
    }
  }

  function router() {
    try {
      const hash = location.hash || "#/";
      if (hash === "#/" || hash === "") { renderHome(); return; }
      if (hash.startsWith("#/post/")) { const id = hash.split("/")[2]?.split("?")[0]; renderPost(id); return; }
      if (hash === "#/about") {
        app.innerHTML = `<article class="post"><h1>About</h1><p><strong>OkObserver</strong> is an unofficial reader for okobserver.org.</p></article>`;
        return;
      }
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Page not found</div>`;
    } catch(e) { showError(`Router crash: ${e?.message||e}`); }
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("load", router);
  window.addEventListener("error", (e)=>showError(`Runtime error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e)=>showError(`Unhandled promise rejection: ${e.reason?.message||e.reason}`));
})();
