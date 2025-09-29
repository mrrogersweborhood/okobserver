// main.js — explicit entry, no fallback imports
// Routes #/, #/about, #/post/:id and nothing else.

window.APP_VERSION = "v2.1.2-nofallback";

// If you’re using the Cloudflare proxy, keep this:
window.OKO_API_BASE = `${location.origin}/api/wp/v2`;

// Optional: Service Worker (safe to keep)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js?v=7").catch(()=>{});
}

// Router
async function router() {
  const hash = location.hash || "#/";
  const m = hash.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);

  try {
    if (m && m[1]) {
      const { renderPost } = await import("./detail.js");
      await renderPost(m[1]);
      return;
    }
    if (hash.startsWith("#/about")) {
      const { renderAbout } = await import("./about.js");
      await renderAbout();
      return;
    }
    const { renderHome } = await import("./home.js");
    await renderHome({});
  } catch (e) {
    console.error("[OkObserver] Router error:", e);
    const host = document.getElementById("app") || document.body;
    host.innerHTML = `<p class="center">Something went wrong. Please reload.</p>`;
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("load", router);
