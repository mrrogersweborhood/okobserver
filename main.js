// main.js — entry point
// Set API base first, then lazy-load core/router to ensure api.js sees the right base.

(() => {
  // Correct Worker base with /wp-json/wp/v2 included
  const WORKER_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";

  // Prefer explicit Worker base. Fallback only if window.OKO_API_BASE is already defined.
  if (!window.OKO_API_BASE) {
    window.OKO_API_BASE = WORKER_BASE;
  }

  // Optional: log for sanity
  console.info("[OkObserver] API base:", window.OKO_API_BASE);
})();

(async () => {
  // Now that OKO_API_BASE is set, load the core (which sets APP_VERSION and router)
  try {
    const { startApp } = await import("./core.js");
    startApp();
  } catch (err) {
    console.error("[OkObserver] No entry module could be loaded. Check filenames/paths.", err);
    const host = document.getElementById("app") || document.body;
    const div = document.createElement("div");
    div.className = "error-banner";
    div.innerHTML =
      '<button class="close" aria-label="Dismiss">×</button>' +
      'App script did not execute. Check Network → main.js (200), hard-reload.';
    host.prepend(div);
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest(".error-banner .close");
        if (btn) btn.closest(".error-banner")?.remove();
      },
      { once: true, capture: true }
    );
  }
})();
