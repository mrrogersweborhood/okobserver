/* main.js – boot + top-level error boundary */
console.log("[OkObserver] Entry loaded: v2.5.4");

/** Global config (locked once) */
export const CONFIG = {
  API_BASE: "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2",
  SITE_BASE: location.origin + location.pathname.replace(/index\.html?$/i, ""),
};
Object.freeze(CONFIG);

const app = document.getElementById("app");

function setView(node) {
  app.innerHTML = "";
  app.appendChild(node);
}

/* Router bootstrap (hash-based) */
async function route() {
  const hash = location.hash || "#/";
  try {
    const { renderHome, renderDetail, renderAbout } = await import("./core-fixed.js");
    const [_, route, id] = hash.split("/");
    if (!route || route === "") return setView(await renderHome());
    if (route === "post" && id) return setView(await renderDetail(id));
    if (route === "about") return setView(await renderAbout());
    return setView(await renderHome());
  } catch (err) {
    console.error("[OkObserver] router error:", err);
    const div = document.createElement("div");
    div.className = "card";
    div.style.padding = "18px";
    div.textContent = "Page error: failed to load module.";
    setView(div);
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);
