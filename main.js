// main.js — stable entry (explicit API base, no autodetect)
// Ensure index.html loads this as: <script type="module" src="main.js"></script>

(() => {
  // 🔒 Use the Worker path you confirmed is exposed:
  // If your Worker exposes /wp/v2 (not /wp-json/wp/v2), keep this as-is.
  const WORKER_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp/v2";

  // Set once so api.js sees the right base immediately
  window.OKO_API_BASE = WORKER_BASE;

  // Optional sanity log
  console.info("[OkObserver] API base (locked):", window.OKO_API_BASE);

  // Clear any old autodetect cache key, if it existed
  try { sessionStorage.removeItem("__oko_api_base"); } catch {}
})();

(async () => {
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
