// main.js — entry router (robust)
// If this file runs, footer probe will see APP_VERSION and the red banner won't appear.
window.APP_VERSION = "v2.2.4";

function isHome(hash) {
  return hash === "" || hash === "#" || hash === "#/";
}

async function renderPostDetail(id) {
  const { renderPost } = await import("./detail.js");
  return renderPost(id);
}

async function renderAbout() {
  const { renderAbout } = await import("./about.js");
  return renderAbout();
}

async function renderHome() {
  const mod = await import("./home.js");
  return mod.renderHome();
}

async function router() {
  const hash = location.hash || "#/";

  if (isHome(hash)) {
    await renderHome();
    return;
  }

  // If leaving Home, snapshot (safe even if not on Home)
  try {
    const app = document.getElementById("app");
    if (app && app.querySelector(".grid")) {
      const { saveHomeSnapshot } = await import("./home.js");
      saveHomeSnapshot();
    }
  } catch {}

  const m = hash.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);
  if (m && m[1]) {
    await renderPostDetail(m[1]);
  } else if (hash.startsWith("#/about")) {
    await renderAbout();
  } else {
    await renderHome();
  }
}

window.addEventListener("hashchange", () => { router().catch(console.error); });
window.addEventListener("load",        () => { router().catch(console.error); });
