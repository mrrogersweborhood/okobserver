// core-fixed.js — OkObserver v2.6.4
// Handles routing and dynamic module loading

window.OKO_VERSION = "v2.6.4";
window.OKO_API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";

console.log(`[OkObserver] Entry loaded: ${window.OKO_VERSION}`);
console.log(`[OkObserver] API base (locked): ${window.OKO_API_BASE}`);

// ---------- Generic fetch with retry and safe errors ----------
export async function fetchWithRetry(url, options = {}, retries = 3, delay = 800) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        console.error("[Parse error]", text.slice(0, 200));
        throw new Error("Invalid JSON from server");
      }
    } catch (err) {
      console.warn(`[Retry ${i + 1}/${retries}]`, err.message);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
}

// ---------- Dynamic Import Helper ----------
async function importRender(path) {
  try {
    const mod = await import(path);
    const fn = mod.default || mod.renderHome || mod.renderAbout || mod.renderPost;
    if (typeof fn === "function") return fn;
    throw new Error(`Module ${path} did not export a render function`);
  } catch (e) {
    console.error("[Import error]", e);
    throw e;
  }
}

// ---------- Router ----------
export async function router() {
  const app = document.getElementById("app");
  if (!app) return;

  const hash = window.location.hash.slice(2); // remove "#/"
  const parts = hash.split("/");
  const route = parts[0] || "";
  const id = parts[1];
  app.innerHTML = "";

  try {
    if (!route || route === "") {
      const renderHome = await importRender("./home.v263.js?v=263");
      await renderHome(app);
      return;
    }

    if (route === "about") {
      const renderAbout = await importRender("./about.v263.js?v=263");
      await renderAbout(app);
      return;
    }

    if (route === "post" && id) {
      const renderPost = await importRender("./detail.v263.js?v=263");
      await renderPost(app, id);
      return;
    }

    // No matching route
    app.innerHTML = `<p style="color:red; text-align:center; margin-top:2em;">
      Page not found
    </p>`;
  } catch (err) {
    console.error("[Router error]", err);
    app.innerHTML = `<p style="color:red; text-align:center; margin-top:2em;">
      Page error: ${err.message}
    </p>`;
  }
}

// ---------- Hash change listener ----------
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
