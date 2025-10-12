// core-fixed.js — resilient router that tolerates default OR named exports

async function importAny(path) {
  const mod = await import(path);
  // prefer default, fall back to common names
  return (
    mod.default ||
    mod.renderHome ||
    mod.home ||
    mod.main ||
    ((...args) => {
      throw new Error(`Module ${path} did not export a render function`);
    })
  );
}

export async function router() {
  const app = document.getElementById("app");
  if (!app) return;

  const hash = (window.location.hash || "#/").replace(/^#/, "");
  const parts = hash.split("/").filter(Boolean);
  const path = parts[0] || "";
  const id = parts[1];

  app.innerHTML = "";

  try {
    if (!path) {
      const renderHome = await importAny("./home.v263.js");
      await renderHome(app);
    } else if (path === "about") {
      const renderAbout = await importAny("./about.v263.js");
      await renderAbout(app);
    } else if (path === "post" && id) {
      const renderPost = await importAny("./detail.v263.js");
      await renderPost(app, id);
    } else {
      const renderHome = await importAny("./home.v263.js");
      await renderHome(app);
    }
  } catch (err) {
    console.error("[Router error]", err);
    app.innerHTML = `<div style="padding:1rem;color:#b00020">
      <strong>Page error:</strong> ${err && err.message ? err.message : err}
    </div>`;
  }
}

export function start() {
  const run = () => router().catch(console.error);
  window.addEventListener("hashchange", run);
  run();
}
