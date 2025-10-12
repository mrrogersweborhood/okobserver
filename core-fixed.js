// core-fixed.js — minimal, robust router with static imports (no query strings)

import renderHome from "./home.v263.js";
import renderAbout from "./about.v263.js";
import renderPost from "./detail.v263.js";

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

  // Clear current view so we can render the route
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
    console.error("[OkObserver] router error:", err);
    app.innerHTML = `<div style="padding:1rem;color:#b00020">
      <strong>Something went wrong loading this page.</strong><br/>
      <small>${String(err)}</small>
    </div>`;
  }
}

export function start() {
  const app = document.getElementById("app");
  if (!app) {
    console.error("[OkObserver] app container not found");
    return;
  }

  function run() {
    try { router().catch((e) => console.error(e)); }
    catch (e) { console.error(e); }
  }

  window.addEventListener("hashchange", run);
  run();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
