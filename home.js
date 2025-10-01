// home.js — post summary grid with infinite scroll + scroll restore

const st = (window.__OKO_ST ??= {
  listAbort: null,
  io: null,
  page: 1,
  totalPages: 1,
  loading: false,
  homeClickSaver: null,
});

import { fetchLeanPostsPage } from "./api.js";
import { renderGridFromPosts, appendCards } from "./shared.js";

const SCROLL_KEY = "__home_scroll_y";

function saveScrollBeforeNavigate(e) {
  const a = e.target.closest && e.target.closest('a[href^="#/post/"]');
  if (!a) return;
  try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)); } catch {}
}

function restoreScrollIfAny() {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (!raw) return;
    const y = Math.max(0, parseInt(raw, 10) || 0);
    // Wait a tick so layout is ready
    requestAnimationFrame(() => { window.scrollTo(0, y); });
    sessionStorage.removeItem(SCROLL_KEY);
  } catch {}
}

export async function renderHome() {
  const app = document.getElementById("app");
  if (!app) return;

  // Reset per-visit state
  st.page = 1;
  st.totalPages = 1;
  st.loading = false;

  // Cancel any prior in-flight request
  if (st.listAbort) { try { st.listAbort.abort(); } catch {} }
  st.listAbort = new AbortController();
  const signal = st.listAbort.signal;

  // Cleanup any prior observer
  if (st.io) { try { st.io.disconnect(); } catch {} st.io = null; }

  // Ensure we save scroll when the user clicks into a post
  if (st.homeClickSaver) {
    document.removeEventListener("click", st.homeClickSaver, true);
  }
  st.homeClickSaver = saveScrollBeforeNavigate;
  document.addEventListener("click", st.homeClickSaver, true);

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

  // Restore prior scroll position if returning from a post
  restoreScrollIfAny();

  // Sentinel for infinite scroll
  const sentinel = document.createElement("div");
  sentinel.id = "scroll-sentinel";
  sentinel.style.height = "1px";
  sentinel.style.marginTop = "1px";
  app.appendChild(sentinel);

  const onIntersect = async (entries) => {
    const entry = entries[0];
    if (!entry || !entry.isIntersecting) return;
    if (st.loading) return;
    if (st.page >= st.totalPages) { try { st.io?.disconnect(); } catch {} return; }

    st.loading = true;
    st.page += 1;

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
      st.page = Math.max(1, st.page - 1);
    } finally {
      st.loading = false;
    }
  };

  st.io = new IntersectionObserver(onIntersect, { root: null, rootMargin: "600px 0px 600px 0px", threshold: 0 });
  st.io.observe(sentinel);
}
