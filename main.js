// main.js — OkObserver (v2025-10-23b)
// Entry point: handles routing and dynamic rendering

import { fetchPosts, fetchPost } from "./api.js?v=2025-10-23b";
import { formatDate } from "./util.js?v=2025-10-23b";
import { renderHome } from "./Home.js?v=2025-10-23b";
import { renderPostDetail } from "./PostDetail.js?v=2025-10-23b";
import { renderAbout } from "./About.js?v=2025-10-23b";
import { renderSettings } from "./Settings.js?v=2025-10-23b";

console.log("[OkObserver] Entry loaded: v2025-10-23b");

// Base API path
export const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";

// Simple router for SPA navigation
async function router() {
  const path = window.location.hash.slice(1).toLowerCase() || "/";
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `<div style="text-align:center;padding:2rem;">Loading…</div>`;

  try {
    if (path === "/" || path === "/posts") {
      await renderHome(app);
    } else if (path.startsWith("/post/")) {
      const id = path.split("/post/")[1];
      await renderPostDetail(app, id);
    } else if (path === "/about") {
      renderAbout(app);
    } else if (path === "/settings") {
      renderSettings(app);
    } else {
      app.innerHTML = `<p style="text-align:center;margin-top:2rem;">Page not found.</p>`;
    }
  } catch (err) {
    console.error("[OkObserver] Router error:", err);
    app.innerHTML = `<p style="text-align:center;color:red;">Error loading content.</p>`;
  }
}

// Event listeners for routing
window.addEventListener("hashchange", router);
window.addEventListener("load", router);

// MutationObserver safeguard for grid consistency (enforce 3–4 columns)
const observer = new MutationObserver(() => {
  const grid = document.querySelector(".post-grid");
  if (grid) {
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(280px, 1fr))";
    grid.style.gap = "1.5rem";
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// Service Worker registration (cache busting)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js?v=2025-10-23b")
    .then(() => console.log("[OkObserver] SW registered (v2025-10-23b)"))
    .catch((err) => console.warn("[OkObserver] SW registration failed:", err));
}
