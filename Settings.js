/* OkObserver Settings Screen
   Version: 2025-10-31j
   - Exposes BOTH a named export `renderSettings` and a default export for compatibility.
   - Non-destructive: does not modify existing header/grid/MutationObserver.
   - Persists preferences in localStorage.
*/

const VER_SETTINGS = "2025-10-31j";
const LS_KEYS = {
  hideCartoons: "okobsv.hideCartoons",
  hideTests: "okobsv.hideTests",
  gridDensity: "okobsv.gridDensity" // "comfortable" | "compact"
};

function getSetting(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return raw;
  } catch {
    return fallback;
  }
}
function setSetting(key, value) {
  try { localStorage.setItem(key, String(value)); } catch {}
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") el.className = v;
    else if (k === "for") el.htmlFor = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) el.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

async function clearAllCaches() {
  if (!("caches" in window)) return { ok: false, msg: "Cache API not supported" };
  const keys = await caches.keys();
  let cleared = 0;
  for (const key of keys) {
    try { if (await caches.delete(key)) cleared++; } catch {}
  }
  return { ok: true, cleared, total: keys.length };
}

function applyGridDensityClass(mode) {
  document.body.classList.remove("density-compact", "density-comfortable");
  const cls = mode === "compact" ? "density-compact" : "density-comfortable";
  document.body.classList.add(cls);
}

function injectLocalStyles() {
  const css = `
  .okobsv-settings { max-width: 840px; margin: 0 auto; padding: 16px 12px 64px; }
  .okobsv-settings h1 { font-size: 1.6rem; margin: 8px 0 4px; }
  .okobsv-settings h2 { font-size: 1.2rem; margin: 20px 0 8px; }
  .okobsv-settings .card {
    background: #fff; border-radius: 16px; box-shadow: 0 2px 10px rgba(0,0,0,.06);
    padding: 16px; margin: 12px 0;
  }
  .okobsv-settings label { display: flex; align-items: center; gap: 10px; cursor: pointer; }
  .okobsv-settings .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .okobsv-settings select, .okobsv-settings button {
    border-radius: 12px; border: 1px solid #e5e7eb; padding: 10px 12px; font-size: 0.95rem;
  }
  .okobsv-settings .muted { color: #6b7280; font-size: 0.9rem; }
  .okobsv-settings .inline { display: inline-flex; align-items: center; gap: 8px; }
  .okobsv-settings .actions { display: flex; gap: 10px; flex-wrap: wrap; }
  .okobsv-settings .btn-primary { background: #1E90FF; color: #fff; border: none; }
  .okobsv-settings .kv { display: grid; grid-template-columns: 140px 1fr; gap: 8px; }
  .okobsv-settings code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
  `;
  const style = document.createElement("style");
  style.setAttribute("data-settings-style", VER_SETTINGS);
  style.textContent = css;
  document.head.appendChild(style);
}

export async function renderSettings($app, opts = {}) {
  const hideCartoons = !!getSetting(LS_KEYS.hideCartoons, false);
  const hideTests    = !!getSetting(LS_KEYS.hideTests, false);
  const gridDensity  = getSetting(LS_KEYS.gridDensity, "comfortable");

  applyGridDensityClass(gridDensity);

  $app.innerHTML = "";
  injectLocalStyles();

  const title = h("h1", {}, "Settings");
  const ver   = h("div", { class: "muted" }, `OkObserver • App ${opts?.VER || "unknown"} • Settings ${VER_SETTINGS}`);

  const filtersCard = h("div", { class: "card" },
    h("h2", {}, "Content Filters"),
    h("div", { class: "kv" },
      h("div", {}, "Hide cartoons"),
      h("div", {},
        h("label", {},
          h("input", {
            type: "checkbox",
            checked: hideCartoons ? "checked" : null,
            onChange: (e) => setSetting(LS_KEYS.hideCartoons, e.target.checked)
          }),
          "Exclude cartoon/illustration posts"
        )
      ),
      h("div", {}, "Hide test posts"),
      h("div", {},
        h("label", {},
          h("input", {
            type: "checkbox",
            checked: hideTests ? "checked" : null,
            onChange: (e) => setSetting(LS_KEYS.hideTests, e.target.checked)
          }),
          "Exclude obvious test/draft posts"
        )
      )
    ),
    h("div", { class: "muted", style: "margin-top:8px" },
      "Note: Home.js can read these flags from localStorage to filter before rendering."
    )
  );

  const densityCard = h("div", { class: "card" },
    h("h2", {}, "Grid Density"),
    h("div", { class: "row" },
      h("div", { class: "inline" },
        h("span", {}, "Card spacing:"),
        h("select", {
          value: gridDensity,
          onChange: (e) => {
            const val = e.target.value === "compact" ? "compact" : "comfortable";
            setSetting(LS_KEYS.gridDensity, val);
            applyGridDensityClass(val);
          }
        },
          h("option", { value: "comfortable", selected: gridDensity !== "compact" ? "selected" : null }, "Comfortable (3–4 cols)"),
          h("option", { value: "compact", selected: gridDensity === "compact" ? "selected" : null }, "Compact (max 4 cols)")
        )
      ),
      h("div", { class: "muted" }, "This toggles a body class only; your grid CSS remains intact.")
    )
  );

  const cacheOutput = h("div", { class: "muted", "aria-live": "polite" });
  const clearBtn = h("button", {
    class: "btn-primary",
    onClick: async () => {
      clearBtn.disabled = true;
      cacheOutput.textContent = "Clearing Cache Storage…";
      try {
        const res = await clearAllCaches();
        cacheOutput.textContent = res.ok
          ? `Cleared ${res.cleared} of ${res.total} cache buckets.`
          : (res.msg || "Could not clear caches.");
      } catch {
        cacheOutput.textContent = "Error clearing caches.";
      } finally {
        clearBtn.disabled = false;
      }
    }
  }, "Clear cached assets");

  const cacheCard = h("div", { class: "card" },
    h("h2", {}, "Cache & Storage"),
    h("div", { class: "actions" }, clearBtn),
    cacheOutput,
    h("div", { class: "muted", style: "margin-top:8px" },
      "Tip: To fully refresh a SW-controlled site, also use DevTools ▶ Application ▶ Service Workers ▶ ",
      h("code", {}, "Unregister"),
      " and then hard reload."
    )
  );

  const infoCard = h("div", { class: "card" },
    h("h2", {}, "About"),
    h("div", {}, "OkObserver — “To comfort the afflicted and afflict the comfortable.”"),
    h("div", { class: "muted", style: "margin-top:6px" },
      "This screen adds user preferences without altering your existing layout."
    )
  );

  const container = h("div", { class: "okobsv-settings" }, title, ver, filtersCard, densityCard, cacheCard, infoCard);
  $app.appendChild(container);
}

export default renderSettings;
