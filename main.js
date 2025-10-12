// main.js — OkObserver v2.6.3 (API path fix)
console.log("[OkObserver] Entry loaded: v2.6.3");

// Use the canonical WP REST base (adjust only this line if needed)
window.OKO_API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
console.log("[OkObserver] API base (locked):", window.OKO_API_BASE);

import { start } from "./core-fixed.js?v=263";

document.addEventListener("DOMContentLoaded", () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();
  start();
});
