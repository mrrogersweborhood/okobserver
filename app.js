// app.js — OkObserver app logic (v1.3)

const APP_VERSION = "v1.3";
const API = "https://okobserver.org/wp-json/wp/v2/posts?_embed&per_page=12";
const EXCLUDE_CAT = "cartoon";

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
    // Exclude posts that have the "cartoon" category
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
    <div id="grid" class="grid" aria-live="polite" aria-busy="true"></div>
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
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          ${
            media
              ? `<a href="#/post/${p.id}"><img class="thumb" src="${media}" alt="${titleText}"></a>`
              : `<a href="#/post/${p.id}"><div class="thumb" role="img" aria-label="${titleText}"></div></a>`
          }
          <div class="card-body">
            <!-- Categories intentionally hidden on summary -->
            <h2 class="title">${p.title.rendered}</h2>
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

  const lm = document.getElementById("loadMore");
  if (lm) lm.onclick = load;
  load();
}

function getPostTags(embeddedTerms) {
  // WordPress embeds terms grouped by taxonomy arrays, typically:
  // [ [categories...], [tags...] ]
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

    // Exclude if the post is in the "cartoon" category
    const excluded = p._embedded?.["wp:term"]?.[0]?.some(
      (cat) => cat.name?.toLowerCase() === EXCLUDE_CAT
    );
    if (excluded) {
      app.innerHTML = `<div class="error-banner">This post is not available.</div>`;
      return;
    }

    // Collect post tags (if any) and render as chips
    const tags = getPostTags(p._embedded?.["wp:term"]);
    const tagsHtml =
      tags.length > 0
        ? `<div class="tags">
             <span class="label">Tags:</span>
             ${tags
               .map((t) => {
                 const name = t.name || "tag";
                 const slug = t.slug || "";
                 const href = slug ? `https://okobserver.org/tag/${slug}/` : "#";
                 return `<a class="tag-chip" href="${href}" target="_blank" rel="noopener" aria-label="Tag: ${name}">${name}</a>`;
               })
               .join("")}
           </div>`
        : "";

    app.innerHTML = `
      <article class="post">
        <h1>${p.title.rendered}</h1>
        <div class="meta">${new Date(p.date).toLocaleDateString()}</div>
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

function router() {
  const hash = location.hash || "#/";
  log(`Routing: ${hash}`);
  if (!app) return;
  if (hash === "#/" || hash === "") {
    renderHome();
  } else if (hash.startsWith("#/post/")) {
    const id = hash.split("/")[2];
    renderPost(id);
  } else if (hash === "#/about") {
    return;
  } else {
    app.innerHTML = `<div class="error-banner">Page not found</div>`;
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("load", () => {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  const footer = document.querySelector("footer .container");
  if (footer) {
    const v = document.createElement("small");
    v.style.marginLeft = "10px";
    v.style.opacity = "0.7";
    v.textContent = APP_VERSION;
    footer.appendChild(v);
  }
  router();
});
