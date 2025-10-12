// detail.v263.js — OkObserver v2.6.4 (update: back button at bottom + keep top link)
export default async function renderPost(app, id) {
  try {
    app.innerHTML = `<div class="loading" style="text-align:center; margin:2em;">Loading...</div>`;

    const apiBase = (window.OKO_API_BASE) || "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
    const url = `${apiBase}/posts/${id}?_embed`;
    console.log("[Post fetch]", url);

    async function apiFetchJson(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API Error ${res.status}`);
      const text = await res.text();
      try { return JSON.parse(text); }
      catch (e) {
        console.error("[Parse error]", text.slice(0,200));
        throw new Error("Invalid JSON in response");
      }
    }

    const post = await apiFetchJson(url);
    if (!post || !post.title) throw new Error("Post not found");

    const title = post.title.rendered || "Untitled";
    const content = post.content?.rendered || "";
    const date = post.date ? new Date(post.date).toLocaleDateString() : "";
    const author = post?._embedded?.author?.[0]?.name || "Oklahoma Observer";

    let featuredHTML = "";
    const media = post?._embedded?.["wp:featuredmedia"]?.[0];
    if (media?.source_url) {
      featuredHTML = `
        <div class="featured-wrapper">
          <img class="featured-image" src="${media.source_url}" alt="${title}" loading="lazy" />
        </div>`;
    }

    const hasVideo = content.includes("<iframe") || content.includes("<video") || content.includes("youtube.com");
    const cleanContent = content.replace(/<p>\s*<\/p>/g, "").replace(/\s{2,}/g, " ").trim();

    // Render with a back link at top AND a prominent button at bottom
    app.innerHTML = `
      <article class="post-detail">
        <a href="#/" class="back-link">← Back to Posts</a>
        <h1 class="post-title">${title}</h1>
        <p class="post-meta">By <span class="post-author">${author}</span> — <time>${date}</time></p>
        ${ hasVideo ? `<div class="video-container">${cleanContent}</div>` : featuredHTML }
        <div class="post-content">${ hasVideo ? "" : cleanContent }</div>

        <!-- Bottom back button -->
        <div style="margin-top:2rem;">
          <a href="#/" class="back-link" style="
              display:inline-flex; align-items:center; gap:.5rem;
              background: var(--brand, #1e90ff); color:#fff; padding:.6rem 1rem;
              border-radius:8px; text-decoration:none; font-weight:600;
              box-shadow:0 2px 6px rgba(0,0,0,.12);
            ">
            ← Back to Posts
          </a>
        </div>
      </article>
    `;
  } catch (err) {
    console.error("[Post render error]", err);
    app.innerHTML = `<p style="color:red; text-align:center; margin-top:2em;">Page error: ${err.message}</p>`;
  }
}
