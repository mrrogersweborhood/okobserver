// home.v263.js — OkObserver v2.6.4 (fixes: robust filtering, stable paging, reliable infinite scroll)
export default async function renderHome(app) {
  try {
    app.innerHTML = `
      <section class="post-list">
        <h2 class="section-title">Latest Posts</h2>
        <div id="post-grid" class="post-grid"></div>
        <div id="loading" class="loading">Loading…</div>
      </section>
    `;

    const apiBase = (window.OKO_API_BASE) || "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";

    // tuning
    const PAGE_SIZE = 12;      // more items per fetch so grid fills naturally
    let page = 1;
    let loading = false;
    let done = false;

    const grid = document.getElementById("post-grid");
    const loadingDiv = document.getElementById("loading");

    async function apiFetchJson(url) {
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) throw new Error(`API Error ${res.status}`);
      const text = await res.text();
      try { return JSON.parse(text); }
      catch (e) { console.error("[Parse error]", text.slice(0, 300)); throw new Error("Invalid JSON"); }
    }

    // Filter out posts in a “cartoon” category or tag (case-insensitive)
    function isCartoon(post) {
      const groups = post?._embedded?.["wp:term"];
      if (!Array.isArray(groups)) return false;
      for (const group of groups) {
        if (!Array.isArray(group)) continue;
        for (const term of group) {
          const name = (term?.name || "").toLowerCase();
          if (name.includes("cartoon")) return true;
        }
      }
      return false;
    }

    function renderPosts(posts) {
      if (!Array.isArray(posts) || posts.length === 0) return;
      for (const post of posts) {
        const title = post?.title?.rendered || "Untitled";
        const date = post?.date ? new Date(post.date).toLocaleDateString() : "";
        const link = `#/post/${post.id}`;

        // pick featured media if available
        let imgHTML = "";
        const media = post?._embedded?.["wp:featuredmedia"]?.[0];
        if (media?.source_url) {
          imgHTML = `<img src="${media.source_url}" alt="${title}" loading="lazy">`;
        }

        const card = document.createElement("article");
        card.className = "post-card";
        card.innerHTML = `
          <a href="${link}" class="post-link" aria-label="${title}">
            <div class="post-thumb">${imgHTML}</div>
            <h3 class="post-title">${title}</h3>
            <time class="post-date">${date}</time>
          </a>
        `;
        grid.appendChild(card);
      }
    }

    async function fetchPostsPage(p) {
      // Note: _embed=1 must be present so featured images and terms are available for filtering
      const url = `${apiBase}/posts?status=publish&_embed=1&per_page=${PAGE_SIZE}&page=${p}`;
      console.log("[Fetching posts]", url);
      const posts = await apiFetchJson(url);

      if (!Array.isArray(posts)) throw new Error("Invalid posts payload");

      const filtered = posts.filter((post) => !isCartoon(post));
      renderPosts(filtered);

      // If we got fewer than PAGE_SIZE back, we’re out of pages
      if (posts.length < PAGE_SIZE) return { count: filtered.length, lastPage: true };
      return { count: filtered.length, lastPage: false };
    }

    // Load initial page
    const first = await fetchPostsPage(page);
    if (first.count === 0 && first.lastPage) {
      loadingDiv.textContent = "No posts found.";
      done = true;
    } else {
      loadingDiv.textContent = " ";
      if (first.lastPage) { loadingDiv.textContent = "All posts loaded."; done = true; }
    }

    // Reliable infinite scroll
    const observer = new IntersectionObserver(async (entries) => {
      const entry = entries[0];
      if (!entry.isIntersecting || loading || done) return;

      loading = true;
      page += 1;
      loadingDiv.textContent = "Loading more…";

      try {
        const next = await fetchPostsPage(page);
        if (next.lastPage) {
          loadingDiv.textContent = "All posts loaded.";
          done = true;
          observer.disconnect();
        } else {
          loadingDiv.textContent = " ";
        }
      } catch (e) {
        console.error("[Infinite scroll]", e);
        loadingDiv.textContent = "Error loading more posts.";
        observer.disconnect();
      } finally {
        loading = false;
      }
    }, {
      root: null,
      rootMargin: "600px 0px", // trigger well before reaching the footer
      threshold: 0
    });

    if (!done) observer.observe(loadingDiv);
  } catch (err) {
    console.error("[Home render failed]", err);
    app.innerHTML = `<p style="color:red; text-align:center; margin-top:2em;">Failed to fetch posts: ${err.message}</p>`;
  }
}
