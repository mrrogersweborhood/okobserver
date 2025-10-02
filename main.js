// main.js — entry router
import { renderHome, saveHomeSnapshot } from "./home.js";
import { ordinalDate } from "./common.js"; // if needed elsewhere

// Expose version for the footer probe
window.APP_VERSION = "v2.2.3-home-cache-restore";

async function renderPostDetail(id) {
  const { renderPost } = await import("./detail.js");
  renderPost(id);
}

async function renderAbout() {
  const { renderAbout } = await import("./about.js");
  renderAbout();
}

function isHome(hash) {
  return hash === "" || hash === "#" || hash === "#/";
}

async function router() {
  const hash = location.hash || "#/";

  if (isHome(hash)) {
    await renderHome();
    return;
  }

  // Save Home snapshot proactively when leaving Home via hash change
  // (safety if a link wasn't clicked—e.g., programmatic nav)
  // Only do this when we are *currently* on Home DOM:
  const app = document.getElementById("app");
  if (app && app.querySelector(".grid")) {
    saveHomeSnapshot();
  }

  const m = hash.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);
  if (m && m[1]) {
    await renderPostDetail(m[1]);
  } else if (hash.startsWith("#/about")) {
    await renderAbout();
  } else {
    await renderHome();
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("load", router);
