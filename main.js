// main.js — OkObserver v2.6.4
import { router } from "./core-fixed.js?v=263";
console.log("[OkObserver] Bootstrapping main.js v2.6.4");
window.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  if (!app) { console.error("[OkObserver] Missing #app container"); return; }
  const nav = document.getElementById("nav");
  if (nav) {
    nav.addEventListener("click", (e) => {
      const a = e.target.closest("a"); if (!a) return;
      e.preventDefault();
      const href = a.getAttribute("href") || "#/";
      if (href.startsWith("#")) window.location.hash = href; else window.open(href, "_blank");
    });
  }
  router();
});
