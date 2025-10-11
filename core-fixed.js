// core-fixed.js — clean router/bootstrap (no query strings; versioned page modules)

/* ------------------------------------------------------------------ */
/* Dynamic renderers                                                  */
/* ------------------------------------------------------------------ */

async function renderHome(into) {
  const mod = await import("./home.v263.js");
  await mod.renderHome(into);
}

async function renderAbout(into) {
  const mod = await import("./about.v263.js");
  await mod.renderAbout(into);
}

async function renderPost(into, id) {
  const mod = await import("./detail.v263.js");
  await mod.renderPost(into, id);
}

/* ------------------------------------------------------------------ */
/* Router                                                             */
/* ------------------------------------------------------------------ */

export async function router() {
  const app = document.getElementById("app");
  if (!app) {
    console.error("[OkObserver] app container not found");
    return;
  }

  const hash = (window.location.hash || "#/").replace(/^#/, "");
  const parts = hash.split("/").filter(Boolean);
  const path = parts[0] || "";
  const id = parts[1];

  // Clear current view
  app.innerHTML = "";

  try {
    if (!path || path === "") {
      await renderHome(app);
    } else if (path === "about") {
      await renderAbout(app);
    } else if (path === "post" && id) {
      await renderPost(app, id);
    } else {
      await renderHome(app);
    }
  } catch (err) {
