// home.v263.js — OkObserver v2.6.4+ (author, pretty date, excerpt; keeps filtering & infinite scroll)
export default async function renderHome(app) {
  try {
    app.innerHTML = `
      <section class="post-list">
        <h2 class="section-title">Latest Posts</h2>
        <div id="post-grid" class="post-grid"></div>
        <div id="loading" class="loading">Loading…</div>
      </section>
    `;

    const apiBase =
      window.OKO_API_BASE ||
      "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";

    const PAGE_SIZE = 12;
    let page = 1;
    let loading = false;
    let done = false;

    const grid = document.getElementById("post-grid");
    const loadingDiv = document.getElementById("loading");

    // ---------- utils ----------
    async function apiFetchJson(url) {
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) throw new Error(`API Error ${res.status}`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        console.error("[Parse error sample]", text.slice(0, 300));
        throw new Error("Invalid JSON");
      }
    }

    function prettyDate(iso) {
      try {
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      } catch {
        return "";
      }
    }

    function stripHtml(html) {
      const tmp = document.createElement("div");
      tmp.innerHTML = html || "";
      return tmp.textContent || tmp.innerText || "";
    }

    // Filter out anything categorized/tagged as "cartoon"
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
      for (const post of posts) {
        const title = post?.title?.rendered || "Untitled";
        const link = `#/post/${post.id}`;
        const datePretty = prettyDate(post?.date);
        const author =
          post?._embedded?.author?.[0]?.name || "Oklahoma Observer";

        // excerpt: prefer WP excerpt, fallback to trimmed content
        const rawExcerpt =
          stripHtml(post?.excerpt?.rendered) ||
          stripHtml(post?.content?.rendered);
        const excerpt =
          rawExcerpt.length > 180
            ? rawExcerpt.slice(0, 177).trimEnd() + "…"
            : rawExcerpt;

        // featured image
        let thumb = "";
        const media = post?._embedded?.["wp:featuredmedia"]?.[0];
        if (media?.source_url) {
          thumb = `<img src="${media.source_url}" alt="${stripHtml(title)}" loading="lazy">`;
        }

        const card = document.createElement("article");
        card.className = "post-card";
        card.innerHTML = `
          <a href="${link}" class="post-link" aria-label="${stripHtml(title)}">
            <div class="post-thumb">${thumb}</div>
          </a>
          <div class="post-body">
            <a href="${link}" class="post-link" aria-label="${stripHtml(title)}">
              <h3 class="post-title">${title}</h3>
            </a>
            <div class="post-byline" style="color:#555;font-size:.9em;margin:0 12px 6px;">
              By <span class="post-author">${author}</span> — <time>${datePretty}</time>
            </div>
            <p class="post-excerpt" style="color:#444;font-size:.95em;margin:0 12px 12px;line-height:1.35;">
              ${excerpt}
            </p>
          </div>
        `;
        grid.appendChild(card);
      }
    }

    async function fetchPostsPage(p) {
      // _embed is required for author/media/terms
      const url = `${apiBase}/posts?status=publish&_embed=1&per_page=${PAGE_SIZE}&page=${p}`;
      console.log("[Fetching posts]", url);
      const posts = await apiFetchJson(url);

      const filtered = posts.filter((post) => !isCartoon(post));
      renderPosts(filtered);

      return {
        count: filtered.length,
        lastPage: posts.length < PAGE_SIZE,
      };
    }

    // initial load
    const first = await fetchPostsPage(page);
    if (first.count === 0 && first.lastPage) {
      loadingDiv.textContent = "No posts found.";
      done = true;
    } else {
      loadingDiv.textContent = " ";
      if (first.lastPage) {
        loadingDiv.textContent = "All posts loaded.";
        done = true;
      }
    }

    // infinite scroll
    const observer = new IntersectionObserver(
      async (entries) => {
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
      },
      {
        root: null,
        rootMargin: "600px 0px",
        threshold: 0,
      }
    );

    if (!done) observer.observe(loadingDiv);
  } catch (err) {
    console.error("[Home render failed]", err);
    app.innerHTML = `<p style="color:red; text-align:center; margin-top:2em;">Failed to fetch posts: ${err.message}</p>`;
  }
}
