// START
/* core.js — router bootstrap with safe start + null-guarded element helper */

/* ------------------------------------------------------------------ */
/* Utilities                                                          */
/* ------------------------------------------------------------------ */

/**
 * Tiny helper to create/augment DOM nodes.
 * Accepts either a tag name or an existing node as the first arg.
 * Adds a null guard to avoid "reading 'className' of null".
 */
export function el(nodeOrTag, props = {}, ...children) {
  const node = (typeof nodeOrTag === "string")
    ? document.createElement(nodeOrTag)
    : nodeOrTag;

  if (!node) throw new Error("el(): received null/undefined node");

  props = props || {};
  // common props
  if (props.className) node.className = props.className;
  if (props.id) node.id = props.id;
  if (props.style && typeof props.style === "object") {
    Object.assign(node.style, props.style);
  }
  if (props.attrs && typeof props.attrs === "object") {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v != null) node.setAttribute(k, String(v));
    }
  }
  if (props.on && typeof props.on === "object") {
    for (const [type, handler] of Object.entries(props.on)) {
      if (handler) node.addEventListener(type, handler, false);
    }
  }

  // remove internal props keys so we don’t assign them directly
  const skip = new Set(["className", "id", "style", "attrs", "on"]);
  for (const [k, v] of Object.entries(props)) {
    if (!skip.has(k) && v !== undefined) node[k] = v;
  }

  for (const c of children) {
    if (c == null) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/* Optional scroll helpers */
const _scrollKey = "okobs:lastScroll";
export function saveScrollForRoute() {
  try { sessionStorage.setItem(_scrollKey, String(window.scrollY || 0)); } catch {}
}
export function restoreScrollPosition() {
  try {
    const y = Number(sessionStorage.getItem(_scrollKey) || 0);
    window.scrollTo({ top: y, behavior: "instant" in window ? "instant" : "auto" });
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Router                                                             */
/* ------------------------------------------------------------------ */

async function renderHome(into) {
  const mod = await import("./home.js");
  await mod.renderHome(into);
}
async function renderAbout(into) {
  const mod = await import("./about.js");
  await mod.renderAbout(into);
}
async function renderPost(into, id) {
  const mod = await import("./detail.js");
  await mod.renderPost(into, id);
}

export async function router() {
  const app = document.getElementById("app");
  if (!app) {
    console.error("[OkObserver] app container not found");
    return;
  }

  const hash = (window.location.hash || "#/").replace(/^#/, "");
  const [path, rawId] = hash.split("/").filter(Boolean);

  // Clear current view
  app.innerHTML = "";

  if (!path || path === "") {
    await renderHome(app);
  } else if (path === "about") {
    await renderAbout(app);
  } else if (path === "post" && rawId) {
    await renderPost(app, rawId);
  } else {
    await renderHome(app);
  }
}

/* ------------------------------------------------------------------ */
/* Safe start                                                         */
/* ------------------------------------------------------------------ */

export function start() {
  const app = document.getElementById("app");
  if (!app) {
    console.error("[OkObserver] app container not found");
    return;
  }

  const run = () => { router().catch((e) => console.error(e)); };
  window.addEventListener("hashchange", run);
  run();
}

// Auto-start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
// END
