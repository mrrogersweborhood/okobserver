// core-fixed.js — stable routing for OkObserver (GitHub Pages–safe)
// Removes ?v= from all dynamic imports, supports default OR named exports.

export function start() {
  router();
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;");
}

// dynamic import helper that strips query params (defensive)
async function loadModule(path) {
  const clean = path.split("?")[0];
  return import(clean);
}

// utility to call default or named export without guessing
async function callExport(mod, candidates, ...args) {
  for (const name of candidates) {
    const fn = name === "default" ? mod?.default : mod?.[name];
    if (typeof fn === "function") return fn(...args);
  }
  throw new Error(`Module missing export (${candidates.join(", ")}). Found: ${Object.keys(mod)}`);
}

export async function router() {
  const app = document.getElementById("app");
  if (!app) return;

  const hash = (window.location.hash || "#/").slice(2); // remove "#/"
  const [route, id] = hash.split("/");

  try {
    if (!route || route === "") {
      const mod = await loadModule("./home.v263.js");
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
      await callExport(mod, ["default", "renderPost", "renderDetail"], app, id);
      return;
    }

    // Fallback to home
    const mod = await loadModule("./home.v263.js");
    await callExport(mod, ["default", "renderHome"], app);
  } catch (err) {
    console.error("[OkObserver router error]", err);
    app.innerHTML = `<div style="padding:2rem"><p style="color:#c00;font-weight:500">
      Page error: ${escapeHtml(err.message || "module load failed.")}
    </p></div>`;
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
