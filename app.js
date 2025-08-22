// app.js — OkObserver app logic (v1.6)
const APP_VERSION = "v1.6";
window.APP_VERSION = APP_VERSION;

console.log(
  "%cOkObserver %c" + APP_VERSION + "%c — loaded",
  "font-weight:700;",
  "color:#1E90FF;font-weight:800;",
  "color:inherit;"
);

const API = "https://okobserver.org/wp-json/wp/v2/posts?_embed&per_page=12";
const EXCLUDE_CAT = "cartoon";
const WP_LOGIN_URL = "https://okobserver.org/wp-login";

const app = document.getElementById("app");
const diag = document.getElementById("diag");

function log(msg) {
  if (!diag) return;
  const row = document.createElement("div");
  row.className = "row";
  row.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  diag.appendChild(row);
  diag.scrollTop = diag.scrollHeight;
}

function esc(s) {
  return (s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[c]);
}
const getAuthorName = (post) =>
  post?._embedded?.author?.[0]?.name ? String(post._embedded.author[0].name) : "";

let controller;
async function fetchPosts(page = 1) {
  if (controller) controller.abort();
  controller = new AbortController();
  const url = `${API}&page=${page}`;
  log(`Fetching: ${url}`);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const posts = await res.json();
    // Exclude Cartoon category
    return posts.filter(
      (p) =>
        !p._embedded?.["wp:term"]?.[0]?.some(
          (cat) => cat.name?.toLowerCase() === EXCLUDE_CAT
        )
    );
  } catch (err) {
    if (err.name === "AbortError") {
      log("Request aborted");
      return [];
    }
    log(`Error: ${err.message}`);
    throw err;
  }
}

function renderHome() {
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
      const posts = await fetchPosts(page);
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
      grid.innerHTML = `<div class="error-banner">Failed to load posts.</div>`;
    } finally {
      loading = false;
    }
  }

  document.getElementById("loadMore").onclick = load;
  load();
}

function getPostTags(embeddedTerms) {
  if (!embeddedTerms || !Array.isArray(embeddedTerms)) return [];
  return embeddedTerms.flat().filter((t) => t?.taxonomy === "post_tag");
}

async function renderPost(id) {
  if (!app) return;
  app.innerHTML = `<p class="center">Loading post…</p>`;
  try {
    const res = await fetch(`https://okobserver.org/wp-json/wp/v2/posts/${id}?_embed`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const p = await res.json();

    // Exclude Cartoon posts at detail level
    const excluded = p._embedded?.["wp:term"]?.[0]?.some(
      (cat) => cat.name?.toLowerCase() === EXCLUDE_CAT
    );
    if (excluded) {
      app.innerHTML = `<div class="error-banner">This post is not available.</div>`;
      return;
    }

    const author = esc(getAuthorName(p));
    const date = new Date(p.date).toLocaleDateString();
    const tags = getPostTags(p._embedded?.["wp:term"]);
    const tagsHtml =
      tags.length > 0
        ? `<div class="tags"><span class="label">Tags:</span>${tags
            .map((t) => {
              const name = t.name || "tag";
              const slug = t.slug || "";
              const href = slug ? `https://okobserver.org/tag/${slug}/` : "#";
              return `<a class="tag-chip" href="${href}" target="_blank" rel="noopener">${name}</a>`;
            })
            .join("")}</div>`
        : "";

    app.innerHTML = `
      <article class="post">
        <h1>${p.title.rendered}</h1>
        <div class="meta-author-date">
          ${author ? `<span class="author">${author}</span>` : ""}
          <span class="date">${date}</span>
        </div>
        ${
          p._embedded?.["wp:featuredmedia"]?.[0]?.source_url
            ? `<img class="hero" src="${p._embedded["wp:featuredmedia"][0].source_url}" alt="">`
            : ""
        }
        <div class="content">${p.content.rendered}</div>
        ${tagsHtml}
        <p><a href="#/" class="btn" style="margin-top:16px">Back to posts</a></p>
      </article>
    `;
  } catch (err) {
    app.innerHTML = `<div class="error-banner">Error loading post: ${err.message}</div>`;
  }
}

/**
 * Render Login route
 * - Embeds the OkObserver WordPress login in an iframe.
 * - Shows a fallback button to open the login page directly if the iframe
 *   is blocked by browser/security headers or if user prefers full-page view.
 */
function renderLogin() {
  if (!app) return;
  app.innerHTML = `
    <article class="post">
      <h1>Login</h1>
      <p class="center" style="margin:8px 0 14px;">
        If the login form doesn’t appear below, use the button to open it directly.
      </p>
      <div class="center" style="margin-bottom:12px;">
        <a class="btn" href="${WP_LOGIN_URL}">Open Login Page</a>
      </div>
      <iframe
        id="loginFrame"
        src="${WP_LOGIN_URL}"
        title="OkObserver Login"
        style="width:100%;height:80vh;border:0;border-radius:10px;background:#fff;"
      ></iframe>
    </article>
  `;
  log("Rendered login route with iframe + fallback button");
}

function router() {
  const hash = location.hash || "#/";
  log(`Routing: ${hash}`);
  if (!app) return;
  if (hash === "#/" || hash === "") {
    renderHome();
  } else if (hash.startsWith("#/post/")) {
    renderPost(hash.split("/")[2]);
  } else if (hash === "#/about") {
    // handled inline in index.html script
    return;
  } else if (hash === "#/login") {
    renderLogin();
  } else {
    app.innerHTML = `<div class="error-banner">Page not found</div>`;
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("load", () => {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  router();
});
