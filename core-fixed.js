// core-fixed.js — clean dynamic imports (NO ?v= in import() URLs)

export function start() {
  router();
}

// Basic, safe escaper for error text
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Centralized dynamic import with optional version stripping (defensive)
async function loadModule(path) {
  // If someone passes "...js?v=271", strip the query so GitHub Pages can serve it
  const clean = path.split("?")[0];
  return import(clean);
}

export async function router() {
  const app = document.getElementById("app");
  if (!app) return;

  const hash = (window.location.hash || "#/").slice(2); // remove "#/"
  const [route, id] = hash.split("/");

  try {
    if (!route || route === "") {
      const mod = await loadModule("./home.v263.js");
      await mod.renderHome(app);
      return;
    }

    if (route === "about") {
      const mod = await loadModule("./about.v263.js");
      await mod.renderAbout(app);
      return;
    }

    if (route === "post" && id) {
      const mod = await loadModule("./detail.v263.js");
      await mod.renderPost(app, id);
      return;
    }

    // Fallback to home if unknown route
    const mod = await loadModule("./home.v263.js");
    await mod.renderHome(app);
  } catch (err) {
    console.error("[Router error]", err);
    app.innerHTML = `<div class="container" style="padding:2rem">
      <p style="color:#b00020">Page error: ${escapeHtml(err?.message || String(err))}</p>
    </div>`;
  }
}

// Keep hash routing responsive
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
