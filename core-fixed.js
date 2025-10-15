// core-fixed.js — GitHub Pages–safe router (no ?v= in imports)

export function start() { router(); }

function escapeHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
async function loadModule(path) { return import(path.split("?")[0]); }

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

  const hash = (window.location.hash || "#/").slice(2);
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
      // Try both signatures: (app,id) named export, or default expecting (id) or (app,id)
      if (mod.renderPostDetail) return mod.renderPostDetail(app, id);
      return callExport(mod, ["default", "renderPost", "renderDetail"], app, id);
    }
    const mod = await loadModule("./home.v263.js");
    await callExport(mod, ["default", "renderHome"], app);
  } catch (err) {
    console.error("[OkObserver router error]", err);
    app.innerHTML = `<div style="padding:2rem"><p style="color:#c00;font-weight:600">
      Page error: ${escapeHtml(err.message || "module load failed.")}</p></div>`;
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
