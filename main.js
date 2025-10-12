// main.js — entry boot
window.OKO_API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev";
console.log("[OkObserver] Entry loaded: v2.6.3");
console.log("[OkObserver] API base (locked):", window.OKO_API_BASE);

import { start } from "./core-fixed.js";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

start();
