// detail.v263.js — OkObserver v2.6.4 stable
// Handles posts with video, including cases where only a Vimeo/YouTube link exists.

export default async function renderPost(app, id) {
  try {
    app.innerHTML = `<div style="text-align:center;margin:2em;">Loading...</div>`;

    const apiBase =
      window.OKO_API_BASE ||
      "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
    const url = `${apiBase}/posts/${id}?_embed=1`;
    console.log("[OkObserver] Fetching post:", url);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    const post = await res.json();

    const title = post.title?.rendered || "Untitled";
    const contentRaw = post.content?.rendered || "";
    const author = post?._embedded?.author?.[0]?.name || "Oklahoma Observer";
    const date = post.date
      ? new Date(post.date).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";

    const media = post?._embedded?.["wp:featuredmedia"]?.[0];
    const posterUrl = media?.source_url || "";

    const parser = new DOMParser();
    const doc = parser.parseFromString(contentRaw, "text/html");

    const iframeEl = doc.querySelector("iframe");
    const videoEl = doc.querySelector("video");

    const YT_RE = /(youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_\-]+)/i;
    const VIMEO_RE = /vimeo\.com\/(\d+)/i;
    const MP4_RE = /\.mp4(\?|$)/i;

    const anchors = doc.querySelectorAll("a[href]");
    let firstPlayableHref = null;
    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (YT_RE.test(href) || VIMEO_RE.test(href) || MP4_RE.test(href)) {
        firstPlayableHref = href;
        break;
      }
    }

    const hasVideo = Boolean(iframeEl || videoEl || firstPlayableHref);

    function toEmbedUrl(href) {
      if (YT_RE.test(href)) {
        const m = href.match(YT_RE);
        return `https://www.youtube-nocookie.com/embed/${m[2]}?rel=0`;
      }
      if (VIMEO_RE.test(href)) {
        const m = href.match(VIMEO_RE);
        return `https://player.vimeo.com/video/${m[1]}`;
      }
      if (MP4_RE.test(href)) {
        return href;
      }
      return null;
    }

    function buildPlayerHTML() {
      if (iframeEl) return iframeEl.outerHTML;
      if (videoEl) return videoEl.outerHTML;
      if (firstPlayableHref) {
        const src = toEmbedUrl(firstPlayableHref);
        if (!src) return "";
        if (MP4_RE.test(src))
          return `<video src="${src}" controls playsinline></video>`;
        return `<iframe src="${src}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
      }
      return "";
    }

    const cleanBody = contentRaw
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/<video[\s\S]*?<\/video>/gi, "");

    const backBtn = `<a href="#/" class="back-link" style="
      display:inline-flex;align-items:center;gap:.5rem;
      background:var(--brand,#1e90ff);color:#fff;
      padding:.6rem 1rem;border-radius:8px;
      text-decoration:none;font-weight:600;
      box-shadow:0 2px 6px rgba(0,0,0,.12);">← Back to Posts</a>`;

    app.innerHTML = `
      <article class="post-detail">
        ${backBtn}
        <h1 class="post-title">${title}</h1>
        <p class="post-meta">By <span class="post-author">${author}</span> — <time>${date}</time></p>

        ${
          hasVideo
            ? `<div class="featured-wrapper" id="video-poster-wrap" style="position:relative;cursor:pointer;">
                <img class="featured-image" src="${posterUrl}" alt="${title}" loading="eager"/>
                <button id="play-btn" aria-label="Play video" style="
                  position:absolute;inset:0;margin:auto;width:74px;height:74px;border:none;
                  border-radius:50%;background:rgba(30,144,255,.9);color:#fff;
                  box-shadow:0 8px 24px rgba(0,0,0,.25);
                  display:flex;align-items:center;justify-content:center;">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
              </div>
              <div id="player-slot" class="video-container" style="display:none;"></div>`
            : posterUrl
            ? `<div class="featured-wrapper"><img class="featured-image" src="${posterUrl}" alt="${title}" loading="eager"/></div>`
            : ""
        }

        <div class="post-content">${cleanBody}</div>
        <div style="margin-top:2rem;">${backBtn}</div>
      </article>
    `;

    if (hasVideo) {
      const wrap = app.querySelector("#video-poster-wrap");
      const slot = app.querySelector("#player-slot");
      const playBtn = app.querySelector("#play-btn");

      const showPlayer = () => {
        const html = buildPlayerHTML();
        if (!html) return;
        slot.innerHTML = html;
        slot.style.display = "block";
        wrap.remove();
        setTimeout(() => slot.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      };

      wrap?.addEventListener("click", showPlayer);
      playBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showPlayer();
      });
    }
  } catch (err) {
    console.error("[Detail render error]", err);
    app.innerHTML = `<p style="color:red;text-align:center;margin-top:2em;">Page error: ${err.message}</p>`;
  }
}
