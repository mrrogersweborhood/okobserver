// core-fixed.js — OkObserver v2.6.4
export async function router() {
  const app = document.getElementById("app"); if (!app) return;
  const hash = window.location.hash || "#/";
  const parts = hash.replace(/^#\//, "").split("/");
  const route = parts[0] || ""; const id = parts[1];
  try {
    if (!route) {
      const mod = await import("./home.v263.js?v=263");
      const renderHome = mod.default || mod.renderHome;
      if (typeof renderHome !== "function") throw new Error("home module missing default export");
      await renderHome(app); return;
    }
    if (route === "about") {
      const mod = await import("./about.v263.js?v=263");
      const renderAbout = mod.default;
      if (typeof renderAbout !== "function") throw new Error("about module missing default export");
      await renderAbout(app); return;
    }
    if (route === "post" && id) {
      const mod = await import("./detail.v263.js?v=263");
      const renderPost = mod.default;
      if (typeof renderPost !== "function") throw new Error("detail module missing default export");
      await renderPost(app, id); return;
    }
    app.innerHTML = `<p style="color:red;">Page not found.</p>`;
  } catch (err) {
    console.error("[Router error]", err);
    app.innerHTML = `<p style="color:red;">Page error: ${err.message}</p>`;
  }
}
window.addEventListener("hashchange", router);
