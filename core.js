// core.js — SPA router + scroll preservation for OkObserver

import { renderHome } from "./home.js";
import { renderAbout } from "./about.js";
import { renderPost } from "./detail.js";

let lastScroll = 0;

export async function router() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/post/")) {
    const id = hash.split("/")[2];
    renderPost(id);
  } else if (hash.startsWith("#/about")) {
    renderAbout();
  } else {
    renderHome();
  }
}

// Save scroll position when navigating away
export function saveScrollForRoute() {
  lastScroll = window.scrollY;
}

// Restore scroll position when returning
export function restoreScrollPosition() {
  if (lastScroll) window.scrollTo(0, lastScroll);
}

export function start() {
  window.addEventListener("hashchange", router);
  router();
}
start();
