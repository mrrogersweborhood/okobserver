// main.js — entry point for OkObserver
// v2.2.6 — Worker Proxy edition

console.log("[OkObserver] App booting main.js v2.2.6");

// Lock API base to Cloudflare Worker proxy
// IMPORTANT: do not point directly to okobserver.org to avoid CORS issues
window.OKO_API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp/v2";

// Simple global error guard
window.addEventListener("unhandledrejection", e => {
  console.error("[OkObserver] Unhandled rejection:", e.reason || e);
});
window.addEventListener("error", e => {
  console.error("[OkObserver] Global error:", e.error || e.message);
});

// App bootstrap
(async function bootstrap() {
  try {
    console.log("[OkObserver] API base (locked):", window.OKO_API_BASE);

    const { router } = await import("./core.js");
    const { initNav } = await import("./shared.js");

    // Kick off nav + routing
    initNav();
    router();

    // Re-route on hashchange
    window.addEventListener("hashchange", router);

  } catch (err) {
    console.error("[OkObserver] Failed to bootstrap:", err);
    document.body.innerHTML = `
      <div style="padding:2rem;font-family:sans-serif;color:#900;">
        <h2>OkObserver failed to start</h2>
        <pre>${String(err)}</pre>
      </div>
    `;
  }
})();
