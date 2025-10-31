/* main.js — OkObserver SPA bootstrap (2025-10-31l)
   - Version bump so SW & browser fetch the latest Home.js with default-on filters
   - Preserves 31h routing/signatures; resilient Settings loader
*/

(function () {
  const VER = "2025-10-31l"; // bump when you deploy
  const BUST = `?v=${VER}`;

  // ——— DOM helpers ———
  const $app =
    document.getElementById("app") ||
    document.querySelector("#app") ||
    document.querySelector("main") ||
    document.body;

  function setApp(html) {
    if ($app) $app.innerHTML = html;
  }
  function log(msg) {
    console.log(`[OkObserver] ${msg}`);
  }

  // ——— Status helpers ———
  function showLoading() {
    setApp(`<div class="loading" style="padding:1rem 0;">Loading…</div>`);
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
    const parts = raw.split("/").filter(Boolean);
    const route = parts[0] || ""; // "" = home
    const param = parts[1] || "";
    return { route, param, raw };
  }

  // ——— Route handlers ———
  async function goHome() {
    showLoading();
    try {
      const { renderHome, default: def } = await import(`./Home.js${BUST}`);
      const fn = typeof renderHome === "function" ? renderHome : def;
      if (typeof fn === "function") {
        await fn($app, { VER });
      } else {
        showError("Home module not found.");
      }
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
      const { renderPost, default: def } = await import(`./PostDetail.js${BUST}`);
      const fn = typeof renderPost === "function" ? renderPost : def;
      if (typeof fn === "function") {
        await fn(Number(id), { VER }); // preserves your working signature
      } else {
        showError("PostDetail module not found.");
      }
    } catch (err) {
      console.error(err);
      showError("Failed to load post.", String(err?.message || err || ""));
    }
  }

  async function goAbout() {
    showLoading();
    try {
      const mod = await import(`./About.js${BUST}`);
      const fn = typeof mod.renderAbout === "function" ? mod.renderAbout : mod.default;
      if (typeof fn === "function") {
        await fn($app, { VER });
      } else {
        setApp("<div class='loading'>About…</div>");
      }
    } catch (e) {
      showError("Unable to load About right now.");
    }
  }

  async function goSettings() {
    showLoading();
    try {
      const mod = await import(`./Settings.js${BUST}`);
      const fn = typeof mod.renderSettings === "function" ? mod.renderSettings : mod.default;
      if (typeof fn === "function") {
        await fn($app, { VER });
      } else {
        setApp("<div class='loading'>Settings…</div>");
      }
    } catch (e) {
      showError("Unable to load Settings right now.");
    }
  }

  // ——— Router ———
  async function router() {
    const h = parseHash();
    log(`Route #/${h.raw || ""} loaded in 0 ms`);

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
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    const b = document.getElementById("build");
    if (b) b.textContent = `Build ${VER}`;
    router();
  });

  // tiny debug handle
  window.__OKO = { VER, router, parseHash };
})();
