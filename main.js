// main.js — entry point for OkObserver SPA (modules)

// 🔒 Lock API base to your Cloudflare Worker proxy
window.OKO_API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp/v2";

// Expose version so the boot probe in index.html can verify script execution
window.APP_VERSION = "v2.3.1";

import { renderHome } from "./home.js";
import { renderPost } from "./detail.js";   // <-- matches export name
import { renderAbout } from "./about.js";

// Simple SPA Router
async function router() {
  const hash = location.hash || "#/";
  const app = document.getElementById("app");
  if (!app) return;

  try {
    if (/^#\/post\/\d+/.test(hash)) {
      const id = (hash.match(/^#\/post\/(\d+)/) || [])[1];
      app.innerHTML = `<div class="center">Loading post…</div>`;
      await renderPost(id);
    } else if (hash.startsWith("#/about")) {
      app.innerHTML = `<div class="center">Loading…</div>`;
      await renderAbout();
    } else {
      app.innerHTML = `<div class="center">Loading…</div>`;
      await renderHome();
    }
  } catch (err) {
    console.error("[OkObserver] Router failed", err);
    app.innerHTML = `<div class="error-banner">
      <button class="close" aria-label="Dismiss">×</button>
      Failed to load content. ${err?.message || err}
    </div>`;
  }
}

// Wire up navigation
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);

console.log("[OkObserver] API base (locked):", window.OKO_API_BASE, window.APP_VERSION);
