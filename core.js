// core.js — centralized routing + delegated navigation
// Uses lazy imports for views and sets global APP_VERSION

import { APP_VERSION } from "./shared.js";

// Expose version for the footer / boot probe
window.APP_VERSION = APP_VERSION;

// ---- Routing ----
function currentHash() {
  return location.hash || "#/";
}

async function router() {
  const hash = currentHash();

  // Route: About
  if (hash.startsWith("#/about")) {
    const { renderAbout } = await import("./about.js");
    await renderAbout();
    return;
  }

  // Route: Post detail
  const m = hash.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);
  if (m && m[1]) {
    const { renderPost } = await import("./detail.js");
    await renderPost(m[1]);
    return;
  }

  // Default: Home (post summary grid)
  const { renderHome } = await import("./home.js");
  await renderHome();
}

// ---- Delegated navigation (single global listener) ----
function delegateClicks() {
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;

      const href = a.getAttribute("href");
      if (!href) return;

      // Internal SPA routes only
      if (href.startsWith("#/")) {
        e.preventDefault();

        // If already on the same hash, allow explicit re-route (rare, but safe)
        if (location.hash === href) {
          router();
        } else {
          location.hash = href;
        }
      }
    },
    { capture: true }
  );
}

// ---- Public entry ----
export function startApp() {
  if (startApp._inited) return;
  startApp._inited = true;

  delegateClicks();
  window.addEventListener("hashchange", router);

  // First route
  router();
}
