// app.js — OkObserver app logic

const API = "https://okobserver.org/wp-json/wp/v2/posts?_embed&per_page=12";
const EXCLUDE_CAT = "cartoon"; // filter out cartoon posts

const app = document.getElementById("app");
const diag = document.getElementById("diag");

function log(msg) {
  const row = document.createElement("div");
  row.className = "row";
  row.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  diag.appendChild(row);
  diag.scrollTop = diag.scrollHeight;
}

// Fetch posts with AbortController
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
    return posts.filter(
      (p) =>
        !p._embedded?.["wp:term"]?.[0]?.some(
          (cat) => cat.name.toLowerCase() === EXCLUDE_CAT
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

// Render posts grid
function renderHome() {
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
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          ${
            p._embedded?.["wp:featuredmedia"]?.[0]?.source_url
              ? `<img class="thumb" src="${p._embedded["wp:featuredmedia"][0].source_url}" alt="">`
              : `<div class="thumb"></div>`
          }
          <div class="card-body">
            ${
              p._embedded?.["wp:term"]?.[0]
                ?.filter((cat) => cat.name.toLowerCase() !== EXCLUDE_CAT)
                .map((cat) => `<span class="cat">${cat.name}</span>`)
                .join(" ") || ""
            }
            <h2 class="title">${p.title.rendered}</h2>
            <div class="excerpt">${p.excerpt.rendered}</div>
            <a href="#/post/${p.id}" class="btn">Read more</a>
          </div>
        `;
        grid.appendChild(card);
      });
      page++;
      if (posts.length === 0) {
        document.getElementById("loadMore").disabled = true;
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

// Render detail view
async function renderPost(id) {
  app.innerHTML = `<p class="center">Loading post…</p>`;
  try {
    const res = await fetch(`https://okobserver.org/wp-json/wp/v2/posts/${id}?_embed`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const p = await res.json();
    const excluded = p._embedded?.["wp:term"]?.[0]?.some(
      (cat) => cat.name.toLowerCase() === EXCLUDE_CAT
    );
    if (excluded) {
      app.innerHTML = `<div class="error-banner">This post is not available.</div>`;
      return;
    }
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
        <p><a href="#/" class="btn">Back to posts</a></p>
      </article>
    `;
  } catch (err) {
    app.innerHTML = `<div class="error-banner">Error loading post: ${err.message}</div>`;
  }
}

// Router
function router() {
  const hash = location.hash || "#/";
  log(`Routing: ${hash}`);
  if (hash === "#/" || hash === "") {
    renderHome();
  } else if (hash.startsWith("#/post/")) {
    const id = hash.split("/")[2];
    renderPost(id);
  } else if (hash === "#/about") {
    // About page is handled inline in index.html
    return;
  } else {
    app.innerHTML = `<div class="error-banner">Page not found</div>`;
  }
}
window.addEventListener("hashchange", router);
window.addEventListener("load", () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  router();
});