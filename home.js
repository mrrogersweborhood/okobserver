import { fetchLeanPostsPage } from "./api.js";

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}

function pickFeatured(post) {
  const media = post?._embedded?.["wp:featuredmedia"]?.[0];
  return media?.source_url || "";
}

export async function renderHome() {
  const app = document.getElementById("app");
  app.innerHTML = `<section class="container"><h1>Latest Posts</h1><div id="grid" class="grid"></div></section>`;
  const grid = document.getElementById("grid");

  let items = [];
  try {
    items = await fetchLeanPostsPage(1, 6);
  } catch (e) {
    grid.innerHTML = `<p>Failed to load posts. ${e.message}</p>`;
    return;
  }

  grid.innerHTML = items.map(p => {
    const img = pickFeatured(p);
    const author = p?._embedded?.author?.[0]?.name || "Oklahoma Observer";
    return `
      <article class="card">
        <a class="thumb-wrap" href="#/post/${p.id}">
          ${img ? `<img class="thumb" src="${img}" alt="">` : ""}
        </a>
        <div class="card-body">
          <h3 class="title"><a href="#/post/${p.id}">${p.title?.rendered || "Untitled"}</a></h3>
          <div class="meta">By ${author} • ${formatDate(p.date)}</div>
          <div class="excerpt">${p.excerpt?.rendered || ""}</div>
        </div>
      </article>
    `;
  }).join("");
}
