// core-fixed.js — robust dynamic imports (NO ?v= in import() URLs)
// - Falls back between default and named exports so detail/home/about keep working
// - Clean errors rendered in-app instead of silent failures

export function start() {
  router();
}

// Safe escaper for error text
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Centralized dynamic import with defensive query stripping
async function loadModule(path) {
  // If someone accidentally passes "...js?v=XYZ", strip the query so GitHub Pages can serve it
  const clean = String(path).split("?")[0];
  return import(clean);
}

// Helper to call the right export (default or named)
async function callExport(mod, candidates, ...args) {
  for (const name of candidates) {
    if (name === "default" && typeof mod?.default === "function") {
      return mod.default(...args);
    }
    if (name !== "default" && typeof mod?.[name] === "function") {
      return mod[name](...args);
    }
  }
  const available = Object.keys(mod || {});
  throw new Error(
    `Module does not export any of: ${candidates.join(", ")}. ` +
    `Available exports: ${available.length ? available.join(", ") : "(none)"}`
  );
}

export async function router() {
  const app = document.getElementById("app");
  if (!app) return;

  const hash = (window.location.hash || "#/").slice(2); // remove "#/"
  const [route, id] = hash.split("/");

  try {
    if (!route || route === "") {
      const mod = await loadModule("./home.v263.js");
      // Try default first, then renderHome (supports both styles)
      await callExport(mod, ["default", "renderHome"], app);
      return;
    }

    if (route === "about") {
      const mod = await loadModule("./about.v263.js");
      await callExport(mod, ["default", "renderAbout"], app);
      return;
    }

    if (route === "post" && id) {
      const mod = await loadModule("./detail.v263.js");
      // Many of your versions used either default or renderPost/renderDetail
      await callExport(mod, ["default", "renderPost", "renderDetail"], app, id);
      return;
    }

    // Fallback to home if unknown route
    const mod = await loadModule("./home.v263.js");
    await callExport(mod, ["default", "renderHome"], app);
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
