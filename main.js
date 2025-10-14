// main.js — lock API base + boot router (standalone)
(function () {
  // Point to your Cloudflare Worker WP API v2 root (no trailing slash)
  const BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  Object.defineProperty(window, "OKO_API_BASE", { value: BASE, writable: false });

  console.info("[OkObserver] main.js v2.6.x booting with API:", window.OKO_API_BASE);

  import("./core-fixed.js")
    .then(mod => mod.start())
    .catch(err => {
      console.error("[Router error]", err);
      document.body.innerHTML =
        `<p style="color:#b00;text-align:center;margin:3rem 0">Page error: ${err?.message || err}</p>`;
    });
})();
