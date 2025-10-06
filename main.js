// main.js — SPA router entry (ES modules)
window.APP_VERSION = "v2.3.4";
console.info("[OkObserver] Entry loaded:", window.APP_VERSION);

function hash() { return location.hash || "#/"; }

async function router() {
  const h = hash();

  const m = h.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);
  if (m) {
    const { renderPost } = await import("./detail.js");
    await renderPost(m[1]);
    return;
  }

  if (h.startsWith("#/about")) {
    const { renderAbout } = await import("./about.js");
    await renderAbout();
    return;
  }

  const { renderHome } = await import("./home.js");
  await renderHome();
}

// Boot error banner if modules fail
(function(){
  window.addEventListener("load", () => {
    setTimeout(() => {
      if (!window.APP_VERSION) {
        const host = document.getElementById("app") || document.body;
        const div = document.createElement("div");
        div.className = "error-banner";
        div.innerHTML = '<button class="close" aria-label="Dismiss">×</button>' +
          'App script did not execute. Check Network → main.js (200), hard-reload.';
        host.prepend(div);
      }
    }, 400);
  });
  document.addEventListener("click",(e)=>{
    const btn=e.target.closest(".error-banner .close");
    if(btn) btn.closest(".error-banner")?.remove();
  });
})();

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
