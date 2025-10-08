// core.js — app shell + router
// Ensures Home always re-renders when navigating back to "#/"
// Version stamp (for the footer / console)
const APP_VERSION = "v2.4.4";
window.APP_VERSION = APP_VERSION;
console.info("[OkObserver] Core loaded:", APP_VERSION);

// Entry points
import { renderHome }   from "./home.js";
import { renderPost }   from "./detail.js";
import { renderAbout }  from "./about.js";

// DOM helpers
const $app = () => document.getElementById("app");
const $ver = () => document.getElementById("appVersion");
const $year = () => document.getElementById("year");

// Simple debounce utility
function debounce(fn, ms = 60) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Keep track of the last routed path to detect redundant navs
let lastRoute = null;

// Read the current hash path (default to "#/")
function currentRoute() {
  const h = location.hash || "#/";
  // normalize any stray hashes
  if (!h.startsWith("#/")) return "#/";
  return h;
}

// After rendering home, restore the saved scroll (if any)
function restoreHomeScroll() {
  try {
    const raw = sessionStorage.getItem("__oko_scroll__");
    if (raw != null) {
      const y = parseInt(raw, 10);
      if (!Number.isNaN(y)) {
        // Use rAF to ensure layout is ready
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, behavior: "instant" in window ? "instant" : "auto" });
        });
      }
      sessionStorage.removeItem("__oko_scroll__");
    } else {
      // default to top
      requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    }
  } catch {
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }
}

// Main router. If `force` is true, we re-render even if the route did not change.
export async function router(force = false) {
  const route = currentRoute();

  // Always keep footer/version fresh when app becomes interactive
  try { if ($ver()) $ver().textContent = APP_VERSION; } catch {}
  try { if ($year()) $year().textContent = String(new Date().getFullYear()); } catch {}

  // Parse routes
  const postMatch = route.match(/^#\/post\/(\d+)(?:[/?].*)?$/);
  const isAbout   = route.startsWith("#/about");
  const isHome    = route === "#/" || route === "#";

  // If the route is the same as before and not forced, do nothing.
  // BUT for Home we *always* allow re-render if `force` is true so
  // "Back to posts" reliably paints the grid.
  if (!force && route === lastRoute) return;

  // Route switch
  if (postMatch) {
    lastRoute = route;
    await renderPost(postMatch[1]);
    return;
  }

  if (isAbout) {
    lastRoute = route;
    await renderAbout();
    return;
  }

  // Home (default)
  lastRoute = route;
  await renderHome({ force: true });   // always force a fresh grid
  restoreHomeScroll();
}

// Hashchange handler — force re-route to guarantee a repaint
const onHashChange = debounce(() => router(true), 0);

// Start the app
export async function start() {
  // First paint
  await router(true);

  // Wire up navigation events
  window.addEventListener("hashchange", onHashChange);

  // Optional: when the page is shown from bfcache, force a re-render
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) router(true);
  });

  // In case there is a delayed CSS/asset load that changes layout,
  // try restoring scroll again shortly after boot.
  setTimeout(restoreHomeScroll, 120);
}

// Auto-start if the script is included after DOM
if (document.readyState === "complete" || document.readyState === "interactive") {
  start();
} else {
  document.addEventListener("DOMContentLoaded", start, { once: true });
}
