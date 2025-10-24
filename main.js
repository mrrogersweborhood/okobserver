// main.js — OkObserver (v2025-10-24b)

import { fetchPosts, fetchPost } from "./api.js?v=2025-10-24b";
import { formatDate } from "./util.js?v=2025-10-24b";
import { renderHome } from "./Home.js?v=2025-10-24b";
import { renderPostDetail } from "./PostDetail.js?v=2025-10-24b";
import { renderAbout } from "./About.js?v=2025-10-24b";
import { renderSettings } from "./Settings.js?v=2025-10-24b";

console.log("[OkObserver] Entry loaded: v2025-10-24b");

export const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";

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

window.addEventListener("hashchange", router);
window.addEventListener("load", router);

const observer = new MutationObserver(() => {
  const grid = document.querySelector(".post-grid, .grid");
  if (grid) {
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(280px, 1fr))";
    grid.style.gap = "1.5rem";
  }
});
observer.observe(document.body, { childList: true, subtree: true });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js?v=2025-10-24b")
    .then(() => console.log("[OkObserver] SW registered (v2025-10-24b)"))
    .catch((err) => console.warn("[OkObserver] SW registration failed:", err));
}
