// core-fixed.js — resilient router with safe dynamic imports (ASCII-only)

async function importAny(path) {
  const mod = await import(path);
  const f =
    mod && (
      mod.default ||
      mod.renderHome ||
      mod.home ||
      mod.main
    );

  if (typeof f === "function") return f;

  throw new Error("Module " + path + " did not export a render function");
}

export async function router() {
  const app = document.getElementById("app");
  if (!app) return;

  const hash = (window.location.hash || "#/").replace(/^#/, "");
  const parts = hash.split("/").filter(Boolean);
  const route = parts[0] || "";
  const id = parts[1];

  app.innerHTML = "";

  try {
    if (!route) {
      const renderHome = await importAny("./home.v263.js");
      await renderHome(app);
      return;
    }

    if (route === "about") {
      const renderAbout = await importAny("./about.v263.js");
      await renderAbout(app);
      return;
    }

    if (route === "post" && id) {
      const renderPost = await importAny("./detail.v263.js");
      await renderPost(app, id);
      return;
    }

    // fallback to home
    const renderHome = await importAny("./home.v263.js");
    await renderHome(app);
  } catch (err) {
    console.error("[Router error]", err);
    var msg = "";
    try { msg = (err && err.message) ? String(err.message) : String(err); }
    catch (_) { msg = "Unknown error"; }

    app.innerHTML =
      "<div style='padding:1rem;color:#b00020'>" +
      "<strong>Page error:</strong> " + msg +
      "</div>";
  }
}

export function start() {
  const run = function () { router().catch(function (e) { console.error(e); }); };
  window.addEventListener("hashchange", run);
  run();
}
