// home.js — renders the post summary grid

// Ensure state bucket exists for aborts (safe if already set elsewhere)
const st = (window.__OKO_ST ??= { listAbort: null });

import { fetchLeanPostsPage } from "./api.js";
import { renderGridFromPosts } from "./shared.js";

export async function renderHome() {
  const app = document.getElementById("app");
  if (!app) return;

  // Cancel any prior in-flight list fetch and create a new AbortController
  if (st.listAbort) {
    try { st.listAbort.abort(); } catch {}
  }
  st.listAbort = new AbortController();
  const signal = st.listAbort.signal;

  app.innerHTML = `<p class="center">Loading…</p>`;

  let pageData;
  try {
    // NOTE: fetchLeanPostsPage returns an object: { posts, totalPages, fromCache }
    pageData = await fetchLeanPostsPage(1, signal);
  } catch (e) {
    console.error("[OkObserver] Home load failed:", e);
    app.innerHTML = `<p class="center">Error loading posts.</p>`;
    return;
  }

  const posts = pageData?.posts || [];
  if (!posts.length) {
    app.innerHTML = `<p class="center">No posts found.</p>`;
    return;
  }

  // Build grid and render
  app.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "grid";
  app.appendChild(grid);

  renderGridFromPosts(posts, grid);

  // (Optional) re-init infinite scroll here if you have it modularized
  // initInfiniteScroll({ startPage: 1, totalPages: pageData.totalPages, signal });
}
