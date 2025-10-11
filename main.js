// main.js — entry point for OKobserver.org (GitHub Pages build)

// --- Configure API base (Cloudflare Worker proxy -> WordPress REST) ---
window.OKO_API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";

// Version banner (helps confirm fresh loads in Console)
console.log("[OkObserver] Entry loaded: v2.5.4");
console.log("[OkObserver] API base (locked):", window.OKO_API_BASE);

// --- Import router (static imports for reliability on GH Pages) ---
import { start } from "./core-fixed.js";

// --- Small boot-time conveniences ---
(function bootStrapUI() {
  // Footer year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Mobile menu toggle (works whether CSS is cached or not)
  const toggle = document.getElementById("menu-toggle");
  const menu = document.querySelector(".menu, .nav");
  if (toggle && menu) {
    toggle.addEventListener("click", () => menu.classList.toggle("open"));
  }
})();

// --- Service worker (optional; ignore failures on GH Pages) ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((err) => {
    console.warn("[OkObserver] SW register failed:", err?.message || err);
  });
}

// --- Start the app router ---
start();
