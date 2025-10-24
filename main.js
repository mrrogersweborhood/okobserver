/* main.js — OkObserver SPA bootstrap & router (v2025-10-24b)
   Full-file replacement. This will overwrite your current main.js.
   After updating, unregister the Service Worker and hard-refresh to avoid stale caches.
*/

/* ===========================
   Imports (cache-busted)
   =========================== */
import { el } from "./util.js?v=2025-10-24b";
import { renderHome } from "./Home.js?v=2025-10-24b";
import { renderAbout } from "./About.js?v=2025-10-24b";
import { renderSettings } from "./Settings.js?v=2025-10-24b";
import { renderPostDetail } from "./PostDetail.js?v=2025-10-24b";

/* ===========================
   Globals
   =========================== */
const APP = {
  version: "v2025-10-24b",
  routes: {},
  appRoot: null,
};

/* ===========================
   Simple Router
   =========================== */

function parseHash() {
  // Expect patterns like: #/, #/about, #/settings, #/post/12345
  const hash = window.location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);

  if (parts.length === 0) {
    return { name: "home", params: {} };
  }

  if (parts[0].toLowerCase() === "about") {
    return { name: "about", params: {} };
  }
  if (parts[0].toLowerCase() === "settings") {
    return { name: "settings", params: {} };
  }
  if (parts[0].toLowerCase() === "post" && parts[1]) {
    return { name: "post", params: { id: parts[1] } };
  }

  // Fallback to home
  return { name: "home", params: {} };
}

async function navigate() {
  const route = parseHash();
  const root = APP.appRoot || el("#app");
  if (!root) return;

  // Optional: small loading state
  root.innerHTML = `<div class="loading">Loading...</div>`;

  try {
    switch (route.name) {
      case "about":
        renderAbout(root);
        break;
      case "settings":
        renderSettings(root);
        break;
      case "post": {
        // Load post via your existing API layer (or inline fetch if you prefer).
        // Here we assume the Home/API layer stores a cached list in sessionStorage/localStorage
        // or you have a small helper to fetch a single post by ID.
        const post = await fetchPostById(route.params.id);
        renderPostDetail(root, post);
        break;
      }
      case "home":
      default:
        await renderHome(root);
        break;
    }
  } catch (err) {
    console.error("[Router] render error:", err);
    root.innerHTML = `
      <section class="page">
        <h1>Something went wrong</h1>
        <p class="muted">Please try again.</p>
        <p><a class="btn btn-primary" href="#/" data-link>Back to Posts</a></p>
      </section>
    `;
  }
}

/* ===========================
   Minimal Single-Post Fetch
   - Replace this with your existing API helper if you have one.
   =========================== */
async function fetchPostById(id) {
  // Try session cache first (if Home stored a map of posts)
  try {
    const raw = sessionStorage.getItem("okob_posts_map");
    if (raw) {
      const map = JSON.parse(raw);
      if (map && map[id]) return map[id];
    }
  } catch {}

  // Fallback: fetch from WordPress REST API
  // NOTE: Update BASE_URL to your actual API root if needed.
  const BASE_URL = "https://okobserver.org/wp-json/wp/v2";
  const url = `${BASE_URL}/posts/${encodeURIComponent(id)}?_embed=1`;

  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`Failed to fetch post ${id}: ${res.status}`);

  const wp = await res.json();

  // Normalize a subset of fields that PostDetail expects
  const title = wp?.title?.rendered || "";
  const content = wp?.content?.rendered || "";
  const date = wp?.date || "";
  const author =
    (wp?._embedded?.author && wp._embedded.author[0]?.name) || "Oklahoma Observer";

  let featured_media_url = "";
  try {
    featured_media_url =
      wp?._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";
  } catch {}

  return {
    id: String(wp?.id ?? id),
    title,
    content,
    date,
    author,
    featured_media_url,
  };
}

/* ===========================
   Boot
   =========================== */
function init() {
  APP.appRoot = el("#app");

  // Nav events for <a data-link> if you choose to intercept clicks
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-link]");
    if (!a) return;
    // For hash routing we can just allow default
    // If you ever switch to history routing, preventDefault here and pushState
  });

  window.addEventListener("hashchange", navigate);
  navigate();

  // Register SW after first paint
  registerSW();
}

/* ===========================
   Service Worker
   =========================== */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  const swUrl = `./sw.js?v=${APP.version}`;
  navigator.serviceWorker
    .register(swUrl)
    .then((reg) => {
      console.log("[OkObserver] SW registered", reg);
    })
    .catch((err) => {
      console.warn("[OkObserver] SW registration failed", err);
    });
}

/* ===========================
   DOM Ready
   =========================== */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
