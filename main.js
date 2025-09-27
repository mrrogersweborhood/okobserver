// main.js — modular entry point for OkObserver
// Sets a global version (used by the error banner) and imports the actual app.
// It tries preferred entries first (e.g., core.js), then falls back to app.js
// so you can switch gradually without breaking.

window.APP_VERSION = "v2.0.0-mod";

(async () => {
  const candidates = [
    "./core.js",          // your modern modular bootstrap (if present)
    "./router.js",        // alternate modular entry (if you split router)
    "./main-app.js",      // another common filename
    "./app.js"            // legacy monolith fallback (still works as a module import)
  ];

  let loaded = false;
  for (const href of candidates) {
    try {
      await import(href);
      console.info("[OkObserver] Loaded entry:", href, window.APP_VERSION);
      loaded = true;
      break;
    } catch (e) {
      // Keep trying next candidate
      console.debug("[OkObserver] Entry not found or failed:", href, e?.message || e);
    }
  }

  if (!loaded) {
    console.error("[OkObserver] No entry module could be loaded. Check filenames/paths.");
    // Let the existing error banner in index.html alert the user if needed
  }
})();
