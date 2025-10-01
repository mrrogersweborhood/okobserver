// home.js — renders the post summary grid with infinite scroll

// Shared state bucket (safe if already exists elsewhere)
const st = (window.__OKO_ST ??= {
  listAbort: null,
  io: null,
  page: 1,
  totalPages: 1,
  loading: false,
});

import { fetchLeanPostsPage } from "./api.js";
import { renderGridFromPosts, appendCards } from "./shared.js";

export async function renderHome() {
  const app = document.getElementById("app");
  if (!app) return;

  // 🔸 Reset per-visit state
  st.page = 1;
  st.totalPages = 1;
  st.loading = false;

  // Cancel any prior in-flight request
  if (st.listAbort) { try { st.listAbort.abort(); } catch {} }
  st.listAbort = new AbortController();
  const signal = st.listAbort.signal;

  // Cleanup any prior observer
  if (st.io) { try { st.io.disconnect(); } catch {} st.io = null; }

  app.innerHTML = `<p class="center">Loading…</p>`;

  // First page
  let pageData;
  try {
    pageData = await fetchLeanPostsPage(1, signal); // { posts, totalPages }
  } catch (e) {
    console.error("[OkObserver] Home load failed:", e);
    app.innerHTML = `<p class="center">Error loading posts.</p>`;
    return;
  }

  const posts = pageData?.posts || [];
  st.totalPages = Number(pageData?.totalPages || 1);

  if (!posts.length) {
    app.innerHTML = `<p class="center">No posts found.</p>`;
    return;
  }

  // Build grid & sentinel
  app.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "grid";
  app.appendChild(grid);

  renderGridFromPosts(posts, grid);

  // Add a sentinel for infinite scroll
  const sentinel = document.createElement("div");
  sentinel.id = "scroll-sentinel";
  sentinel.style.height = "1px";
  sentinel.style.marginTop = "1px";
  app.appendChild(sentinel);

  // IntersectionObserver callback
  const onIntersect = async (entries) => {
    const entry = entries[0];
    if (!entry || !entry.isIntersecting) return;
    if (st.loading) return;
    if (st.page >= st.totalPages) {
      // No more pages — stop observing
      try { st.io?.disconnect(); } catch {}
      return;
    }

    st.loading = true;
    st.page += 1;

    // New AbortController just for the next page load
    if (st.listAbort) { try { st.listAbort.abort(); } catch {} }
    st.listAbort = new AbortController();
    const nextSignal = st.listAbort.signal;

    try {
      const nextData = await fetchLeanPostsPage(st.page, nextSignal);
      const nextPosts = nextData?.posts || [];
      appendCards(nextPosts, grid);
      st.totalPages = Number(nextData?.totalPages || st.totalPages);
    } catch (e) {
      console.warn("[OkObserver] Next page load failed:", e);
      // Roll back the page pointer so we can retry on next intersection
      st.page = Math.max(1, st.page - 1);
    } finally {
      st.loading = false;
    }
  };

  // Create and start observer (rootMargin to pre-load a bit earlier)
  st.io = new IntersectionObserver(onIntersect, { root: null, rootMargin: "600px 0px 600px 0px", threshold: 0 });
  st.io.observe(sentinel);
}
