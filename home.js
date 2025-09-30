// home.js — renders the post summary grid

// ✅ Ensure state bucket exists for aborts
const st = (window.__OKO_ST ??= { listAbort: null });

import { fetchLeanPostsPage } from "./api.js";
import { renderGridFromPosts } from "./shared.js";

export async function renderHome() {
  const app = document.getElementById("app");
  if (!app) return;

  // ✅ cancel any previous request and create new AbortController
  if (st.listAbort) {
    try { st.listAbort.abort(); } catch {}
  }
  st.listAbort = new AbortController();
  const signal = st.listAbort.signal;

  app.innerHTML = `<p class="center">Loading…</p>`;

  let posts;
  try {
    posts = await fetchLeanPostsPage(1, { signal });
  } catch (e) {
    console.error("[OkObserver] Home load failed:", e);
    app.innerHTML = `<p class="center">Error loading posts.</p>`;
    return;
  }

  if (!posts || !posts.length) {
    app.innerHTML = `<p class="center">No posts found.</p>`;
    return;
  }

  app.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "grid";
  app.appendChild(grid);

  renderGridFromPosts(posts, grid);

  // TODO: infinite scroll re-init would go here if you’re using it
}
