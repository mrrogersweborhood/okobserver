// home.v263.js — OkObserver v2.6.4
// Handles fetching and rendering posts with safe error handling

import { fetchWithRetry } from "./core-fixed.js?v=263";

// ---------- SAFE FETCH JSON ----------
async function apiFetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API Error ${res.status}`);

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("[Parse error]", text.slice(0, 200));
      throw new Error("Invalid JSON in response");
    }
  } catch (err) {
    console.error("[Router error]", err);
    const app = document.getElementById("app");
    if (app) {
      app.innerHTML = `<p style="color:red; text-align:center; margin-top:2em;">
        Page error: ${err.message}
      </p>`;
    }
  }
}

// ---------- FETCH POSTS PAGE ----------
export async function renderHome(app) {
  try {
    app.innerHTML = `
      <section class="post-list">
        <h2 class="section-title">Latest Posts</h2>
        <div id="post-grid" class="post-grid"></div>
        <div id="loading" class="loading">Loading...</div>
      </section>
    `;

    let page = 1;
    let loading = false;
    const grid = document.getElementById("post-grid");
    const loadingDiv = document.getElementById("loading");

    async function fetchPostsPage(pageNum) {
      const apiBase = window.OKO_API_BASE || "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
      const url = `${apiBase}/posts?status=publish&_embed&per_page=9&page=${pageNum}`;
      console.log("[Fetching posts]", url);
      const posts = await apiFetchJson(url);
      if (!posts || !Array.isArray(posts)) throw new Error("Invalid posts response");

      // Filter out "cartoon" or "cartoons" categories
      const filtered = posts.filter(
        p =>
          !p.categories ||
          !p.categories.some(
            c =>
              typeof c === "string" &&
              c.toLowerCase().includes("cartoon")
          )
      );

      renderPosts(filtered);
      return filtered.length;
    }

    function renderPosts(posts) {
      if (!posts || posts.length === 0) return;
      for (const post of posts) {
        const title = post.title?.rendered || "Untitled";
        const date = new Date(post.date).toLocaleDateString();
        const link = `#/post/${post.id}`;

        let img = "";
        if (post._embedded && post._embedded["wp:featuredmedia"]) {
          const media = post._embedded["wp:featuredmedia"][0];
          img = `<img src="${media.source_url}" alt="${title}" loading="lazy"/>`;
        }

        const el = document.createElement("article");
        el.className = "post-card";
        el.innerHTML = `
          <a href="${link}" class="post-link">
            <div class="post-thumb">${img}</div>
            <h3 class="post-title">${title}</h3>
            <time class="post-date">${date}</time>
          </a>
        `;
        grid.appendChild(el);
      }
    }

    // Initial load
    const firstCount = await fetchPostsPage(page);
    if (firstCount === 0) {
      grid.innerHTML = "<p>No posts found.</p>";
      return;
    }

    // Infinite scroll
    const observer = new IntersectionObserver(async entries => {
      if (entries[0].isIntersecting && !loading) {
        loading = true;
        page++;
        loadingDiv.textContent = "Loading more...";
        try {
          const count = await fetchPostsPage(page);
          if (count < 9) {
            observer.disconnect();
            loadingDiv.textContent = "All posts loaded.";
          }
        } catch (e) {
          console.error("[Infinite scroll error]", e);
          loadingDiv.textContent = "Error loading posts.";
          observer.disconnect();
        }
        loading = false;
      }
    });

    observer.observe(loadingDiv);
  } catch (err) {
    console.error("[Home load failed]", err);
    app.innerHTML = `<p style="color:red; text-align:center; margin-top:2em;">
      Failed to fetch posts: ${err.message}
    </p>`;
  }
}
