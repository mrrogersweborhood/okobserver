// core.js — SPA router + scroll preservation for OkObserver

const APP_ID = "app";
const HOME_SCROLL_KEY = "__oko_home_scrollY";
const HOME_ROUTE_KEY = "__oko_home_hash";

export function saveHomeScroll() {
  try {
    const y = String(window.scrollY || 0);
    sessionStorage.setItem(HOME_SCROLL_KEY, y);
    sessionStorage.setItem(HOME_ROUTE_KEY, location.hash || "#/");
  } catch (_) {}
}

export function restoreHomeScroll() {
  try {
    const lastRoute = sessionStorage.getItem(HOME_ROUTE_KEY);
    if (lastRoute && !lastRoute.startsWith("#/")) return;
    const y = parseInt(sessionStorage.getItem(HOME_SCROLL_KEY) || "0", 10);
    if (!Number.isNaN(y)) window.scrollTo(0, y);
  } catch (_) {}
}

function appHost() {
  const host = document.getElementById(APP_ID);
  if (!host) console.error("[OkObserver] app container not found");
  return host;
}

export async function router() {
  const host = appHost();
  if (!host) return;

  const hash = location.hash || "#/";

  const m = hash.match(/^#\/post\/(\d+)(?:[/?].*)?$/);
  if (m && m[1]) {
    saveHomeScroll();
    const { renderPost } = await import("./detail.js");
    await renderPost(host, m[1]);
    return;
  }

  if (hash.startsWith("#/about")) {
    const { renderAbout } = await import("./about.js");
    await renderAbout(host);
    return;
  }

  const { renderHome } = await import("./home.js");
  await renderHome(host);
  restoreHomeScroll();
}

function handleClicksForScroll(e) {
  const a = e.target.closest("a[href^='#/']");
  if (!a) return;
  const href = a.getAttribute("href") || "";
  if (/^#\/post\//.test(href)) saveHomeScroll();
}

export function start() {
  window.addEventListener("hashchange", router);
  document.addEventListener("click", handleClicksForScroll);
  router();
}

export default start;
start();