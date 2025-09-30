// main.js — entry point for OkObserver modular app
// Updated to use Cloudflare Worker proxy

window.APP_VERSION = "v2.2.0-worker";
console.info("OkObserver app loaded", window.APP_VERSION);

// ✅ Cloudflare Worker proxy URL
window.OKO_API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp/v2";

// Simple state
const state = {
  currentView: null,
};

// Router
async function router() {
  const hash = location.hash || "#/";
  if (hash === "#/" || hash === "#") {
    const { renderHome } = await import("./home.js");
    renderHome();
  } else if (hash.startsWith("#/post/")) {
    const m = hash.match(/^#\/post\/(\d+)/);
    if (m) {
      const { renderPost } = await import("./detail.js");
      renderPost(m[1]);
    }
  } else if (hash.startsWith("#/about")) {
    const { renderAbout } = await import("./about.js");
    renderAbout();
  } else {
    const { renderHome } = await import("./home.js");
    renderHome();
  }
}

// Listen for navigation
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);

// Footer version info
window.addEventListener("load", () => {
  const v = document.getElementById("appVersion");
  if (v) v.textContent = window.APP_VERSION;
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
});

// Optional: register Service Worker for caching
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js?v=7").catch(() => {});
}
