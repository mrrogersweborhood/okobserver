// core.js — central router + app frame
// v2.2.6 — Worker Proxy edition

import { renderHome } from "./home.js";
import { ordinalDate } from "./shared.js";

// Router handles #/, #/post/:id, and #/about
export async function router() {
  const hash = location.hash || "#/";
  console.log("[OkObserver] Routing:", hash);

  const app = document.getElementById("app");
  if (!app) return;

  if (hash === "#/" || hash === "") {
    // Home / feed
    await renderHome();
  } else {
    const m = hash.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);
    if (m && m[1]) {
      // Post detail
      const { renderPost } = await import("./detail.js");
      await renderPost(m[1]);
    } else if (hash.startsWith("#/about")) {
      // About page
      const { renderAbout } = await import("./about.js");
      renderAbout();
    } else {
      // Fallback → Home
      console.warn("[OkObserver] Unknown route, falling back to home");
      await renderHome();
    }
  }
}

// Utility — consistent date rendering across all modules
export function formatDate(dateStr) {
  try {
    return ordinalDate(dateStr);
  } catch {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }
}
