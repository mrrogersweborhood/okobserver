// main.js — OkObserver v2.6.4
console.log("[OkObserver] Entry loaded: v2.6.4");

// Use the canonical WP REST path behind your Cloudflare Worker
window.OKO_API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
console.log("[OkObserver] API base (locked):", window.OKO_API_BASE);

// Router
import { start } from "./core-fixed.js?v=263";

document.addEventListener("DOMContentLoaded", () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();
  start();
});
