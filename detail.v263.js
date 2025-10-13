// detail.v263.js — OkObserver v2.6.4+
// Restores verbose video handling with POSTER ➜ click-to-play overlay.
// Keeps: author/date, featured image fallback, cleaned content, bottom Back button.

export default async function renderPost(app, id) {
  try {
    app.innerHTML = `<div class="loading" style="text-align:center; margin:2em;">Loading...</div>`;

    const apiBase =
      window.OKO_API_BASE ||
      "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
    const url = `${apiBase}/posts/${id}?_embed=1`;
    console.log("[Post fetch]", url);

    // ---------- utils ----------
    async function apiFetchJson(u) {
      const res = await fetch(u, { credentials: "omit" });
      if (!res.ok) throw new Error(`API Error ${res.status}`);
      const txt = await res.text();
      try {
        return JSON.parse(txt);
      } catch {
        console.error("[Parse error sample]", txt.slice(0, 300));
        throw new Error("Invalid JSON in response");
      }
    }

    const stripHtml = (html) => {
      const el = document.createElement("div");
      el.innerHTML = html || "";
      return el.textContent || el.innerText || "";
    };

    const post = await apiFetchJson(url);
    if (!post || !post.title) throw new Error("Post not found");

    const title = post.title.rendered || "Untitled";
    const contentRaw = post.content?.rendered || "";
    const author = post?._embedded?.author?.[0]?.name || "Oklahoma Observer";
    const date = post.date
      ? new Date(post.date).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";

    // --- Featured media (poster) ---
    const media = post?._embedded?.["wp:featuredmedia"]?.[0];
    const posterUrl = media?.source_url || "";

    // --- Video detection in content ---
    // We treat any iframe/video or common providers as "has video".
    const hasIframe = /<iframe[\s\S]*?>/i.test(contentRaw);
    const hasVideoTag = /<video[\s\S]*?>/i.test(contentRaw);
    const looksYouTube = /youtube\.com|youtu\.be/i.test(contentRaw);
    const looksVimeo = /vimeo\.com/i.test(contentRaw);
    const looksMp4 = /\.mp4(\?|")/i.test(contentRaw);
    const hasVideo = hasIframe || hasVideoTag || looksYouTube || looksVimeo || looksMp4;

    // Clean up empty paragraphs & excessive whitespace for the text body
    const cleanedBody = contentRaw
      .replace(/<p>\s*<\/p>/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    // Helper: build the playable embed block extracted from content
    // We prefer the first iframe/video in the content; fall back to raw content if needed.
    function extractFirstPlayer(html) {
      const temp = document.createElement("div");
      temp.innerHTML = html;

      const iframe = temp.querySelector("iframe");
      if (iframe) {
        // Strip potentially unsafe attributes
        iframe.removeAttribute("width");
        iframe.removeAttribute("height");
        iframe.setAttribute("allowfullscreen", "true");
        return iframe.outerHTML;
      }

      const video = temp.querySelector("video");
      if (video) {
        video.setAttribute("controls", "");
        video.removeAttribute("width");
        video.removeAttribute("height");
        return video.outerHTML;
      }

      // If no direct player, sometimes providers inject a div wrapper. In that case return original.
      return html;
    }

    // UI: Poster overlay that swaps to player on click (no autoplay by default)
    function posterOverlayHTML() {
      const safeTitle = stripHtml(title);
      const posterImg = posterUrl
        ? `<img class="featured-image" src="${posterUrl}" alt="${safeTitle}" loading="eager" />`
        : `<div style="background:#eee;height:56vw;max-height:450px;border-radius:8px;"></div>`;

      return `
        <div class="featured-wrapper" id="video-poster-wrap" style="position:relative; cursor:pointer;">
          ${posterImg}
          <button
            id="play-btn"
            aria-label="Play video"
            style="
              position:absolute; inset:0; margin:auto; width:74px; height:74px; border-radius:50%;
              border:none; background:rgba(30,144,255,.95); color:#fff; box-shadow:0 8px 24px rgba(0,0,0,.25);
              display:flex; align-items:center; justify-content:center; transition:transform .12s ease; "
            onmouseover="this.style.transform='scale(1.05)';"
            onmouseout="this.style.transform='scale(1.0)';"
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z"></path>
            </svg>
          </button>
        </div>
      `;
    }

    // Build the initial article markup (poster first if video; else just featured image + content)
    app.innerHTML = `
      <article class="post-detail">
        <a href="#/" class="back-link">← Back to Posts</a>

        <h1 class="post-title">${title}</h1>
        <p class="post-meta">By <span class="post-author">${author}</span> — <time>${date}</time></p>

        ${hasVideo ? posterOverlayHTML() : (posterUrl ? `
          <div class="featured-wrapper">
            <img class="featured-image" src="${posterUrl}" alt="${stripHtml(title)}" loading="eager"/>
          </div>` : ""
        )}

        <div id="player-slot" class="video-container" style="display:none;"></div>

        <div id="post-body" class="post-content">
          ${hasVideo ? cleanedBody.replace(/<iframe[\s\S]*?<\/iframe>/gi, "").replace(/<video[\s\S]*?<\/video>/gi,"") : cleanedBody}
        </div>

        <div style="margin-top:2rem;">
          <a href="#/" class="back-link" style="
            display:inline-flex; align-items:center; gap:.5rem;
            background: var(--brand, #1e90ff); color:#fff; padding:.6rem 1rem;
            border-radius:8px; text-decoration:none; font-weight:600;
            box-shadow:0 2px 6px rgba(0,0,0,.12);">
            ← Back to Posts
          </a>
        </div>
      </article>
    `;

    // Wire up click-to-play only if video exists
    if (hasVideo) {
      const wrap = app.querySelector("#video-poster-wrap");
      const playerSlot = app.querySelector("#player-slot");
      const bodyEl = app.querySelector("#post-body");

      const mountPlayer = () => {
        const embedHTML = extractFirstPlayer(contentRaw);
        // swap in player
        playerSlot.innerHTML = embedHTML;
        playerSlot.style.display = "block";

        // keep the aspect ratio container wrapping if it is an iframe
        if (playerSlot.querySelector("iframe") && !playerSlot.classList.contains("video-container")) {
          playerSlot.classList.add("video-container");
        }

        // remove poster
        if (wrap) wrap.remove();

        // Optional: scroll a bit to keep player in view (if the header pushes content down)
        setTimeout(() => {
          playerSlot.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
      };

      if (wrap) wrap.addEventListener("click", mountPlayer);
      const playBtn = app.querySelector("#play-btn");
      if (playBtn) playBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        mountPlayer();
      });
    }
  } catch (err) {
    console.error("[Post render error]", err);
    app.innerHTML = `<p style="color:red; text-align:center; margin-top:2em;">Page error: ${err.message}</p>`;
  }
}
