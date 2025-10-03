// home.js — renders the post summary grid
// v2.2.6 — Worker Proxy edition

import { fetchLeanPostsPage, cartoonCategoryId } from "./api.js";
import { formatDate } from "./core.js";
import { decodeHTMLEntities, state } from "./shared.js";

export async function renderHome() {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `<p class="center">Loading…</p>`;

  try {
    // reset if fresh load
    if (!state.homePage) {
      state.homePage = 1;
      state.posts = [];
      state._io?.disconnect?.();
      state._io = null;
    }

    const posts = await fetchLeanPostsPage(state.homePage);

    // Filter out "cartoon" category posts
    const cleanPosts = posts.filter(p => !p.categories?.includes(cartoonCategoryId));

    // Append to state
    state.posts.push(...cleanPosts);

    app.innerHTML = `<div class="grid">${state.posts
      .map(post => renderCard(post))
      .join("")}</div>`;

    // Infinite scroll
    setupInfiniteScroll();

  } catch (err) {
    console.error("[OkObserver] Home load failed:", err);
    app.innerHTML = `<div class="error-banner">Failed to load posts. ${err.message}</div>`;
  }
}

function renderCard(post) {
  const title = decodeHTMLEntities(post.title?.rendered || "");
  const excerpt = decodeHTMLEntities(post.excerpt?.rendered || "").replace(/<[^>]+>/g, "");
  const author = post._embedded?.author?.[0]?.name || "";
  const date = formatDate(post.date);
  const img = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "icon.png";

  return `
    <div class="card">
      <img class="thumb" src="${img}" alt="" onclick="location.hash='#/post/${post.id}'"/>
      <div class="card-body">
        <a href="#/post/${post.id}" class="title">${title}</a>
        <div class="meta-author-date">
          ${author ? `<span>${author}</span>` : ""}
          <span class="date">${date}</span>
        </div>
        <p class="excerpt">${excerpt}</p>
      </div>
    </div>
  `;
}

function setupInfiniteScroll() {
  const grid = document.querySelector(".grid");
  if (!grid) return;

  // disconnect old observer
  if (state._io) {
    state._io.disconnect();
    state._io = null;
  }

  const sentinel = document.createElement("div");
  sentinel.className = "sentinel";
  grid.appendChild(sentinel);

  const io = new IntersectionObserver(async entries => {
    if (entries.some(e => e.isIntersecting)) {
      state.homePage++;
      const posts = await fetchLeanPostsPage(state.homePage);
      const cleanPosts = posts.filter(p => !p.categories?.includes(cartoonCategoryId));
      state.posts.push(...cleanPosts);

      grid.innerHTML = state.posts.map(post => renderCard(post)).join("");
      setupInfiniteScroll();
    }
  }, { rootMargin: "400px" });

  io.observe(sentinel);
  state._io = io;
}
