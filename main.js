// main.js — modular entry point for OkObserver
// - Sets global version for the banner
// - Points API to Cloudflare Worker proxy via window.OKO_API_BASE (api.js honors this)
// - Registers Service Worker for repeat-visit speed
// - Dynamically imports your app entry (core/router/main-app/app.js)

window.APP_VERSION = "v2.1.0-proxy";

// FRONT-END API BASE → use Cloudflare Worker proxy on same origin
// api.js will use this override if present, so we don't have to edit common.js.
window.OKO_API_BASE = `${location.origin}/api/wp/v2`;

// Register Service Worker for API & image caching on repeat visits
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js?v=7").catch(()=>{});
}

(async () => {
  const candidates = [
    "./core.js",          // modern modular bootstrap (if present)
    "./router.js",        // alternate modular entry
    "./main-app.js",      // another common filename
    "./app.js"            // legacy monolith fallback (imported as module)
  ];

  let loaded = false;
  for (const href of candidates) {
    try {
      await import(href);
      console.info("[OkObserver] Loaded entry:", href, window.APP_VERSION);
      loaded = true;
      break;
    } catch (e) {
      console.debug("[OkObserver] Entry not found or failed:", href, e?.message || e);
    }
  }

  if (!loaded) {
    console.error("[OkObserver] No entry module could be loaded. Check filenames/paths.");
    // The existing error banner in index.html will surface if needed.
  }
})();
