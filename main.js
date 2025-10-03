// main.js — entry with API base auto-detect (caches the working base)
// Requires: index.html loads as <script type="module" src="main.js">

const WORKER_ORIGIN = "https://okobserver-proxy.bob-b5c.workers.dev";
const CANDIDATES = [
  `${WORKER_ORIGIN}/wp-json/wp/v2`, // standard WP path
  `${WORKER_ORIGIN}/wp/v2`,         // your Worker’s alternative path
];

const CACHE_KEY = "__oko_api_base";

function timeout(ms) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
}

async function probeBase(base) {
  // Lightweight capability check; /types exists on WP REST
  const url = `${base}/types?per_page=1`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      // credentials not needed for public WP endpoints
    });
    if (res.ok) return true;
    // Some proxies may return 405/401 for HEAD — we use GET and expect 200
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function detectApiBase() {
  // 1) Honor explicit global (useful for debugging)
  if (typeof window.OKO_API_BASE === "string" && window.OKO_API_BASE.startsWith("http")) {
    return window.OKO_API_BASE.replace(/\/+$/, "");
  }

  // 2) Cached winner for this session
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return cached;
  } catch {}

  // 3) Probe candidates in order
  for (const base of CANDIDATES) {
    const ok = await probeBase(base);
    if (ok) {
      try { sessionStorage.setItem(CACHE_KEY, base); } catch {}
      return base;
    }
  }

  // 4) Last-resort fallback (may be blocked by CORS, but avoids hard failure)
  return "https://okobserver.org/wp-json/wp/v2";
}

(async () => {
  try {
    const base = await detectApiBase();
    window.OKO_API_BASE = base;
    console.info("[OkObserver] API base:", base);

    const { startApp } = await import("./core.js");
    startApp();
  } catch (err) {
    console.error("[OkObserver] Failed to bootstrap app.", err);
    const host = document.getElementById("app") || document.body;
    const div = document.createElement("div");
    div.className = "error-banner";
    div.innerHTML =
      '<button class="close" aria-label="Dismiss">×</button>' +
      'App script did not execute. Check Network → main.js (200), and that the Worker is reachable.';
    host.prepend(div);
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest(".error-banner .close");
        if (btn) btn.closest(".error-banner")?.remove();
      },
      { once: true, capture: true }
    );
  }
})();
