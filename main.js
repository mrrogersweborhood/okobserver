// main.js — minimal router entry (ES modules)
// Loads home, detail, about on demand. Keeps API base flexible.
// v=2.3.0

window.APP_VERSION = "v2.3.0";
console.info("[OkObserver] Entry loaded:", window.APP_VERSION);

// If you want to hard-pin the API base at build time, set window.OKO_API_BASE
// in a tiny inline script *before* this file. Otherwise modules will read it
// dynamically and fall back safely.

function routeHash() {
  return location.hash || "#/";
}

async function router() {
  const hash = routeHash();

  // #/post/123
  const m = hash.match(/^#\/post\/(\d+)(?:[/?].*)?$/);
  if (m) {
    const id = m[1];
    const { renderPost } = await import("./detail.js");
    await renderPost(id);
    return;
  }

  // #/about
  if (hash.startsWith("#/about")) {
    const { renderAbout } = await import("./about.js");
    await renderAbout();
    return;
  }

  // default: home
  const { renderHome } = await import("./home.js");
  await renderHome();
}

// Basic boot error banner (same look/feel as earlier)
(function bootProbe() {
  window.addEventListener("load", () => {
    setTimeout(() => {
      if (!window.APP_VERSION) {
        const host = document.getElementById("app") || document.body;
        const div = document.createElement("div");
        div.className = "error-banner";
        div.innerHTML =
          '<button class="close" aria-label="Dismiss">×</button>' +
          'App script did not execute. Check Network → main.js (200), hard-reload.';
        host.prepend(div);
      }
    }, 400);
  });
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".error-banner .close");
    if (btn) btn.closest(".error-banner")?.remove();
  });
})();

// Simple SPA wiring
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
