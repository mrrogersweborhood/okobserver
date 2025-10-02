// main.js — entry router
import { renderHome, saveHomeSnapshot } from "./home.js";

// Expose version for the footer probe (match index.html version query)
window.APP_VERSION = "v2.2.4";

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

  // If leaving Home, snapshot in case navigation didn't go through an <a> click
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
