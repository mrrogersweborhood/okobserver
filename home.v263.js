// home.v263.js — OkObserver v2.6.4
export default async function renderHome(app) {
  try {
    app.innerHTML = `<section class="post-list">
      <h2 class="section-title">Latest Posts</h2>
      <div id="post-grid" class="post-grid"></div>
      <div id="loading" class="loading">Loading...</div>
    </section>`;
    const apiBase = (window.OKO_API_BASE) || "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
    let page = 1; let loading = false;
    const grid = document.getElementById("post-grid");
    const loadingDiv = document.getElementById("loading");
    async function apiFetchJson(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API Error ${res.status}`);
      const text = await res.text();
      try { return JSON.parse(text); } catch (e) { console.error("[Parse error]", text.slice(0,200)); throw new Error("Invalid JSON in response"); }
    }
    function renderPosts(posts) {
      if (!Array.isArray(posts) || posts.length === 0) return;
      for (const post of posts) {
        const title = post?.title?.rendered || "Untitled";
        const date = post?.date ? new Date(post.date).toLocaleDateString() : "";
        const link = `#/post/${post.id}`;
        let imgHTML = "";
        const media = post?._embedded?.["wp:featuredmedia"]?.[0];
        if (media?.source_url) imgHTML = `<img src="${media.source_url}" alt="${title}" loading="lazy" />`;
        const el = document.createElement("article");
        el.className = "post-card";
        el.innerHTML = `<a href="${link}" class="post-link">
            <div class="post-thumb">${imgHTML}</div>
            <h3 class="post-title">${title}</h3>
            <time class="post-date">${date}</time>
          </a>`;
        grid.appendChild(el);
      }
    }
    async function fetchPostsPage(p) {
      const url = `${apiBase}/posts?status=publish&_embed&per_page=9&page=${p}`;
      console.log("[Fetching posts]", url);
      const posts = await apiFetchJson(url);
      if (!Array.isArray(posts)) throw new Error("Invalid posts response");
      const filtered = posts.filter((post) => {
        const terms = post?._embedded?.["wp:term"];
        if (Array.isArray(terms)) {
          for (const group of terms) if (Array.isArray(group)) {
            for (const term of group) {
              const name = (term?.name || "").toLowerCase();
              if (name.includes("cartoon")) return false;
            }
          }
        }
        return true;
      });
      renderPosts(filtered);
      return filtered.length;
    }
    const firstCount = await fetchPostsPage(page);
    if (firstCount === 0) { grid.innerHTML = "<p>No posts found.</p>"; loadingDiv.textContent = ""; return; }
    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && !loading) {
        loading = true; page += 1; loadingDiv.textContent = "Loading more...";
        try {
          const count = await fetchPostsPage(page);
          if (count < 9) { observer.disconnect(); loadingDiv.textContent = "All posts loaded."; }
          else { loadingDiv.textContent = " "; }
        } catch (e) { console.error("[Infinite scroll error]", e); loadingDiv.textContent = "Error loading posts."; observer.disconnect(); }
        finally { loading = false; }
      }
    });
    observer.observe(loadingDiv);
  } catch (err) {
    console.error("[Home render failed]", err);
    app.innerHTML = `<p style="color:red; text-align:center; margin-top:2em;">Failed to fetch posts: ${err.message}</p>`;
  }
}
