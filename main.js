// main.js — OkObserver v2.6.4
// Initializes the app and hooks up navigation

import { router } from "./core-fixed.js?v=263";

console.log("[OkObserver] Bootstrapping main.js v2.6.4");

window.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  if (!app) {
    console.error("[OkObserver] Missing #app container");
    return;
  }

  // Initialize navigation
  const nav = document.getElementById("nav");
  if (nav) {
    nav.addEventListener("click", e => {
      if (e.target.tagName === "A") {
        e.preventDefault();
        const href = e.target.getAttribute("href");
        if (href.startsWith("#")) {
          window.location.hash = href;
        } else {
          window.open(href, "_blank");
        }
      }
    });
  }

  // Kick off first route render
  router();
});
