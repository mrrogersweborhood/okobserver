// core.js — centralized routing + delegated navigation

import { APP_VERSION } from "./shared.js";

// Expose version for footer/boot probe
window.APP_VERSION = APP_VERSION;

function currentHash() {
  return location.hash || "#/";
}

async function router() {
  const hash = currentHash();
  const app = document.getElementById("app");
  if (!app) return;

  // About
  if (hash.startsWith("#/about")) {
    const { renderAbout } = await import("./about.js");
    await renderAbout();
    return;
  }

  // Post detail
  const m = hash.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);
  if (m && m[1]) {
    const { renderPost } = await import("./detail.js");
    await renderPost(m[1]);
    return;
  }

  // Default: Home
  const { renderHome } = await import("./home.js");
  await renderHome();
}

// Single global delegated listener for internal nav
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

export function startApp() {
  if (startApp._inited) return;
  startApp._inited = true;

  delegateClicks();
  window.addEventListener("hashchange", router);

  // First route
  router();
}
