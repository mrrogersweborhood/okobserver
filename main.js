import { APP_VERSION, app, state, saveHomeCache, clearHomeCaches, isHomeRoute } from "./common.js";
import { renderHome, ensureInfiniteScroll, attachScrollFallback, loadNextPage } from "./home.js";

console.info("OkObserver (modules) loaded", APP_VERSION);

// Hard-reload detection + purge before any rehydrate
(function rehydrate(){
  let navType = "";
  try {
    const nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    navType = nav ? nav.type : (performance.navigation && performance.navigation.type === 1 ? "reload" : "");
  } catch {}
  const isReload = (navType === "reload");
  if (isReload) {
    clearHomeCaches("hard-reload");
  }
  // We intentionally do not read __okCache here; home.js manages it.
})();

// Controllers (shared aborts)
const controllers = { listAbort: null, detailAbort: null, aboutAbort: null };

async function router(){
  if (!location.hash || location.hash === "#") {
    location.replace("#/");
  }
  const hash = window.location.hash || "#/";
  const m = hash.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);
  if (m && m[1]) {
    const { renderDetail } = await import("./detail.js");
    await renderDetail(m[1], controllers);
  } else if (hash.startsWith("#/about")) {
    const { renderAbout } = await import("./about.js");
    await renderAbout(controllers);
  } else {
    await renderHome(controllers);
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
if (document.readyState === "interactive" || document.readyState === "complete") { router(); }

// Keep scroll listener to unlock page-2 and fallback infinite scroll in home
attachScrollFallback(controllers);

// Optional: expose for debugging
window.__ok = { state, loadNextPage, ensureInfiniteScroll, version: APP_VERSION };
