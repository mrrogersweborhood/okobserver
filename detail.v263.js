/* detail.v263.js — FULL FILE (ready to paste) */

/* ------------------------------------------------------------------
   OkObserver – Post Detail View (v2.6.3 compatible)
   - No module exports; attaches to window.Module.renderDetail
   - Safe API helper resolution (apiJSON / API_BASE)
   - Title + byline under title
   - Big video: poster swaps to full-width player
   ------------------------------------------------------------------ */

(function () {
  // ------- Utilities (safe resolves) --------------------------------
  const Module = (window.Module = window.Module || {});
  const apiJSON =
    window.apiJSON ||
    Module.apiJSON ||
    // last-resort no-op to surface a clearer message
    (async function () {
      throw new ReferenceError(
        "[Detail] apiJSON is not available on window or Module."
      );
    });

  // Allow direct-load fixup of API_BASE if main hasn’t set it yet.
  let API_BASE = window.API_BASE || Module.API_BASE;
  if (!API_BASE && typeof location !== "undefined") {
    // Your proxy base; adjust if you ever change it:
    API_BASE =
      "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/";
    window.API_BASE = Module.API_BASE = API_BASE;
    console.info("[Detail] API_BASE auto-set for direct page load");
  }

  // Date pretty-print
  function prettyDate(iso) {
    try {
      const d = new Date(iso);
      const opts = { year: "numeric", month: "long", day: "numeric" };
      return d.toLocaleDateString(undefined, opts);
    } catch {
      return "";
    }
  }

  // Decode HTML entities in WordPress title
  const _p = document.createElement("textarea");
  function decode(html) {
    _p.innerHTML = html || "";
    return _p.value;
  }

  // Extract featured image URL from WP _embedded media
  function featuredSrc(post) {
    const m = post?._embedded?.["wp:featuredmedia"]?.[0];
    return (
      m?.source_url ||
      m?.media_details?.sizes?.large?.source_url ||
      m?.media_details?.sizes?.medium_large?.source_url ||
      m?.media_details?.sizes?.full?.source_url ||
      ""
    );
  }

  // Find first video URL (Vimeo/YouTube/Facebook) in the content
  function extractVideoURL(html) {
    if (!html) return null;
    const a = document.createElement("div");
    a.innerHTML = html;
    const ifr = a.querySelector("iframe[src]");
    if (ifr) return ifr.getAttribute("src");

    // Fallback: look for naked links
    const link = a.querySelector("a[href]");
    return link ? link.getAttribute("href") : null;
  }

  // Normalize a player URL type
  function normalizePlayer(url) {
    if (!url) return null;
    const u = String(url);
    if (/vimeo\.com/.test(u)) return { type: "vimeo", url: u };
    if (/youtube\.com|youtu\.be/.test(u)) return { type: "youtube", url: u };
    if (/facebook\.com/.test(u)) return { type: "facebook", url: u };
    return { type: "unknown", url: u };
  }

  // Player iframe HTML (full width)
  function playerHTML(embed) {
    const baseStyle =
      "width:100%;aspect-ratio:16/9;border:0;border-radius:12px;display:block;";
    const src = embed.url;
    return `<iframe src="${src}" allowfullscreen loading="lazy" style="${baseStyle}"></iframe>`;
  }

  // Poster render w/ big click target
  function posterHTML(src, title) {
    return `
      <div class="oko-video-poster" role="button" tabindex="0" aria-label="Play video"
           style="position:relative;cursor:pointer;outline:0;display:block;">
        <img src="${src}" alt="" style="width:100%;height:auto;border-radius:12px;display:block;">
        <span class="oko-video-play"
              style="position:absolute;left:50%;top:50%;
                     width:66px;height:66px;margin:-33px 0 0 -33px;border-radius:50%;
                     background:rgba(0,0,0,.5);display:grid;place-items:center;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <path d="M8 5v14l11-7z"></path>
          </svg>
        </span>
      </div>`;
  }

  // Remove empty WP filler nodes (optional tidy)
  function stripEmptyBlocks(html) {
    if (!html) return "";
    return html
      .replace(/<p>\s*(?:&nbsp;|\s|<br\s*\/?>)*<\/p>/gi, "")
      .replace(/\s+<\/(h\d|p|div)>/gi, "</$1>");
  }

  // Simple back button HTML (anchor; router will intercept)
  function backButtonHTML() {
    return `<a href="#/" class="oko-btn-back" data-nav="back"
              style="display:inline-flex;gap:.5rem;align-items:center;
                     background:#1e63ff;color:#fff;border-radius:999px;
                     padding:.5rem .9rem;font-weight:600;text-decoration:none;">
              <span aria-hidden="true">←</span><span>Back to Posts</span>
            </a>`;
  }

  // --------- MAIN RENDER -------------------------------------------
  async function renderDetail(mount, id) {
    // Flexible arg handling (mount or id can arrive in either slot)
    let target = mount;
    let postId = id;

    const isEl = (x) => x && (x.nodeType === 1 || x === document || x === window);

    if (!isEl(target)) {
      postId = mount;
      target = document.getElementById("app") || document.body;
    }

    // Guard API_BASE
    const base = window.API_BASE || Module.API_BASE || API_BASE;
    if (!base) {
      target.innerHTML =
        '<section class="ok-card" style="max-width:920px;margin:1.25rem auto;padding:1rem"><p class="error" style="color:#b00">API base missing.</p></section>';
      return;
    }

    // Fetch first — avoid showing back buttons before content is ready
    let post;
    try {
      post = await apiJSON.call(null, `posts/${encodeURIComponent(postId)}`, {
        _embed: 1,
      });
    } catch (err) {
      console.error("[Detail] fetch failed", err);
      target.innerHTML = `
        <section class="ok-card" style="max-width:920px;margin:1.25rem auto;padding:1rem">
          <p class="error" style="color:#b00">Failed to load post.</p>
          <p><a class="oko-btn-back" href="#/">← Back to Posts</a></p>
        </section>`;
      return;
    }

    // Prepare data
    const rawTitle = post?.title?.rendered || "(Untitled)";
    const titleText = decode(rawTitle);
    const author = post?._embedded?.author?.[0]?.name || "Oklahoma Observer";
    const dateText = prettyDate(post?.date || post?.date_gmt);
    const poster = featuredSrc(post);
    const contentRaw = post?.content?.rendered || "";
    const found = extractVideoURL(contentRaw);
    const embed = found ? normalizePlayer(found) : null;

    const mediaHTML = (() => {
      if (poster && embed && embed.type !== "facebook") {
        // Poster first, user clicks to swap to full player
        return `
          <figure class="post-media" style="margin:0 0 1rem 0">
            ${posterHTML(poster, titleText)}
          </figure>`;
      }
      if (embed) return `<figure class="post-media">${playerHTML(embed)}</figure>`;
      if (poster) return `<figure class="post-media"><img src="${poster}" alt="" class="oko-detail-img" style="width:100%;height:auto;border-radius:12px"></figure>`;
      return "";
    })();

    // Clean body content a bit + make embeds/images elegant by default
    let content = stripEmptyBlocks(contentRaw)
      .replaceAll(
        "<iframe",
        `<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px;margin:1rem 0;"`
      )
      .replaceAll(
        "<img",
        `<img loading="lazy" style="max-width:100%;height:auto;border-radius:12px;margin:1rem 0;"`
      );

    // Build final article (note: no .ok-card on article => no blue header bg)
    target.innerHTML = `
      <article class="post-detail" style="max-width:980px;margin:0 auto 56px;padding:0 12px;background:transparent;box-shadow:none;border:0;">
        <div class="oko-actions-top" style="margin:0 0 .75rem 0;display:none">${backButtonHTML()}</div>

        ${mediaHTML}

        <header class="post-header" style="background:transparent;padding:0;margin:.35rem 0 .35rem 0;border:0">
          <h1 class="post-title" style="margin:0 0 .25rem 0;line-height:1.15">${titleText}</h1>
          <div class="post-meta" style="color:#555;margin:0 0 .75rem 0">By ${author} — ${dateText}</div>
        </header>

        <div class="post-content" style="line-height:1.65">${content}</div>

        <div class="oko-actions-bottom" style="margin-top:1.1rem;display:none">${backButtonHTML()}</div>
      </article>
    `;

    // Show back buttons only after content exists
    const topBtnWrap = target.querySelector(".oko-actions-top");
    const botBtnWrap = target.querySelector(".oko-actions-bottom");
    if (topBtnWrap) topBtnWrap.style.display = "block";
    if (botBtnWrap) botBtnWrap.style.display = "block";

    // Poster → swap to full-size player (not tiny)
    const posterEl = target.querySelector(".oko-video-poster");
    if (posterEl && embed && embed.type !== "facebook") {
      const swap = () => {
        const fig = posterEl.closest(".post-media");
        if (fig) fig.innerHTML = playerHTML(embed);
      };
      posterEl.addEventListener("click", swap);
      posterEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          swap();
        }
      });
    }

    // Router back
    target.addEventListener("click", (e) => {
      const b = e.target.closest('[data-nav="back"]');
      if (b) {
        e.preventDefault();
        window.location.hash = "#/";
      }
    });

    // First paragraph polish
    const firstP = target.querySelector(".post-content p");
    if (firstP) {
      firstP.innerHTML = firstP.innerHTML
        .replace(/^(&nbsp;|\s|<br\s*\/?>)+/i, "")
        .trimStart();
      firstP.style.textIndent = "0";
    }
  }

  // Expose entry point used by your router
  Module.renderDetail = renderDetail;
})();
