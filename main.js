/* main.js — OkObserver SPA bootstrap
   - Robust hash router (supports "#/", "#/post/:id", "#/about", "#/settings")
   - Safe dynamic imports with cache-bust
   - Clear status messages on network/404 vs unknown routes
   - Minimal logging so you can see route flow in Console
*/

(function () {
  const VER = "2025-10-31g"; // bump when you deploy
  const BUST = `?v=${VER}`;

  // ——— DOM helpers ———
  const $app = document.getElementById("app");
  function setApp(html) {
    if ($app) $app.innerHTML = html;
  }
  function note(msg) {
    console.log(`[OkObserver] ${msg}`);
  }

  // ——— Status helpers ———
  function showLoading() {
    setApp(`<div class="loading">Loading…</div>`);
  }
  function showError(title, detail = "") {
    setApp(
      `<div style="padding:2rem 0;max-width:900px;margin:0 auto;">
         <h3 style="margin:0 0 .5rem 0;">${title}</h3>
         ${detail ? `<div style="color:#666">${detail}</div>` : ""}
       </div>`
    );
  }
  function showNotFound() {
    showError("Page not found.");
  }

  // ——— Route parsing ———
  function parseHash() {
    const raw = (location.hash || "").replace(/^#\/?/, ""); // drop "#/" or "#"
    const parts = raw.split("/").filter(Boolean); // ["post","123"] or []
    const route = parts[0] || ""; // "" = home
    const param = parts[1] || "";
    return { route, param, raw };
  }

  // ——— Route handlers ———
  async function goHome() {
    showLoading();
    try {
      const { renderHome } = await import(`./Home.js${BUST}`);
      await renderHome({ VER });
    } catch (err) {
      console.error(err);
      showError("Network error while loading posts. Please retry.");
    }
  }

  async function goPost(id) {
    if (!id || !/^\d+$/.test(id)) {
      showNotFound();
      return;
    }
    showLoading();
    try {
      const { renderPost } = await import(`./PostDetail.js${BUST}`);
      await renderPost(Number(id), { VER });
    } catch (err) {
      console.error(err);
      // If the fetch inside PostDetail throws a 404, it will already render a message.
      // If it failed before fetch (module/network), show a generic error:
      showError("Failed to load post.", String(err?.message || err || ""));
    }
  }

  async function goAbout() {
    showLoading();
    try {
      const mod = await import(`./About.js${BUST}`);
      await (mod.renderAbout ? mod.renderAbout({ VER }) : setApp("<div class='loading'>About…</div>"));
    } catch (e) {
      showError("Unable to load About right now.");
    }
  }

  async function goSettings() {
    showLoading();
    try {
      const mod = await import(`./Settings.js${BUST}`);
      await (mod.renderSettings ? mod.renderSettings({ VER }) : setApp("<div class='loading'>Settings…</div>"));
    } catch (e) {
      showError("Unable to load Settings right now.");
    }
  }

  // ——— Router ———
  async function router() {
    const h = parseHash();
    note(`Route #/${h.raw || ""} loaded in 0 ms`);

    switch (h.route) {
      case "":
      case "home":
      case "posts":
        await goHome();
        break;
      case "post":
        await goPost(h.param);
        break;
      case "about":
        await goAbout();
        break;
      case "settings":
        await goSettings();
        break;
      default:
        showNotFound();
    }
  }

  // ——— Wiring ———
  window.addEventListener("hashchange", router);
  window.addEventListener("DOMContentLoaded", () => {
    // Footer build stamp (non-blocking)
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    const b = document.getElementById("build");
    if (b) b.textContent = VER;

    // First navigation
    router();
  });

  // Expose small debug handle
  window.__OKO = { VER, router, parseHash };
})();
