/* OkObserver Post Detail
   Version: 2025-11-02D
   - Media-first (video or image), title/byline beneath
   - Title in OkObserver blue (#1E90FF), bold byline
   - Back-to-posts button in brand blue
   - Video handling (priority order):
       1) Featured MP4 (native <video>)
       2) Vimeo link in content (responsive iframe)
       3) YouTube link in content (responsive iframe)
       4) Facebook video link in content -> show poster + "Watch on Facebook" button (no iframe)
       5) Fallback to featured image
*/

export async function renderPost(id, { VER } = {}) {
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const $app =
    document.getElementById("app") ||
    document.querySelector("#app") ||
    document.body;

  if (!$app || !id) return;

  // Shell
  $app.innerHTML = `
    <article class="post-detail" style="max-width:980px;margin:0 auto;padding:18px 14px 60px;">
      <div class="loading" style="text-align:center;padding:1.25rem 0;">Loading…</div>
    </article>
  `;
  const $detail = $app.querySelector(".post-detail");

  // ---- Fetch post ----
  let post = null;
  try {
    const res = await fetch(
      `${API_BASE}/posts/${id}?_embed=1&_=${encodeURIComponent(VER || "detail")}`,
      { credentials: "omit", cache: "no-store" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    post = await res.json();
  } catch (err) {
    console.error("[PostDetail] fetch failed:", err);
    $detail.innerHTML = `
      <h2 style="margin:0 0 .5rem 0;">Unable to load this post.</h2>
      <p style="color:#666">Please try again, or return to the post list.</p>
      <footer style="margin-top:28px;">
        <a href="#/" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#1E90FF;color:#fff;text-decoration:none;">← Back to posts</a>
      </footer>
    `;
    return;
  }

  // ---- Helpers ----
  const textFromHTML = (html = "") => {
    const d = document.createElement("div");
    d.innerHTML = html;
    return (d.textContent || d.innerText || "").trim();
  };
  const getAuthor = (p) => {
    try { return p?._embedded?.author?.[0]?.name || ""; } catch {}
    return "";
  };
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch { return ""; }
  };

  // Featured media probe
  function getFeaturedInfo(p) {
    const m = p?._embedded?.["wp:featuredmedia"]?.[0] || null;
    if (!m) return null;
    const poster = m?.source_url || "";
    const md = m?.media_details || {};
    const meta = m?.meta || {};
    const possible = [md?.source_url, md?.file, m?.source_url, meta?.video_url, meta?.source_url].filter(Boolean);
    const mp4 = possible.find((u) => /\.mp4($|\?)/i.test(u)) || "";
    return { poster, mp4, alt: m?.alt_text || "", w: md?.width || 0, h: md?.height || 0 };
  }

  function detectLinksFromContent(html = "") {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;

    const urls = new Set();
    const raw = (tmp.textContent || "").trim();
    const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
    (raw.match(urlRegex) || []).forEach((u) => urls.add(u.trim()));
    tmp.querySelectorAll("a[href]").forEach((a) => urls.add(a.getAttribute("href")));

    let vimeo = null, youtube = null, facebook = null;

    for (const u of urls) {
      if (!vimeo) {
        const m = u.match(/vimeo\.com\/(\d+)/i);
        if (m && m[1]) vimeo = { id: m[1], url: u };
      }
      if (!youtube) {
        const vParam = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
        const short  = u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
        const shorts = u.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/);
        const vid = (vParam && vParam[1]) || (short && short[1]) || (shorts && shorts[1]) || "";
        if (vid) youtube = { id: vid, url: u };
      }
      if (!facebook && /facebook\.com\/.*\/videos\/\d+/i.test(u)) {
        facebook = { url: u };
      }
      if (vimeo && youtube && facebook) break;
    }

    return { vimeo, youtube, facebook };
  }

  // ---- Data ----
  const title = textFromHTML(post?.title?.rendered) || "Untitled";
  const author = getAuthor(post);
  const date = fmtDate(post?.date);
  const featured = getFeaturedInfo(post);
  const contentHTML = post?.content?.rendered || "";
  const links = featured && featured.mp4 ? {} : detectLinksFromContent(contentHTML);

  // Build media block (priority)
  let mediaHTML = "";

  if (featured && featured.mp4) {
    mediaHTML = `
      <figure class="post-hero" style="margin:18px 0;">
        <video playsinline controls preload="metadata" style="width:100%;height:auto;border-radius:10px;background:#000;">
          <source src="${featured.mp4}" type="video/mp4">
        </video>
      </figure>`;
  } else if (links.vimeo) {
    const src = `https://player.vimeo.com/video/${links.vimeo.id}`;
    mediaHTML = `
      <figure class="post-hero" style="margin:18px 0;">
        <div class="oko-embed" style="position:relative;width:100%;padding-top:56.25%;margin:12px 0;">
          <iframe src="${src}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture"
                  allowfullscreen
                  style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe>
        </div>
      </figure>`;
  } else if (links.youtube) {
    const src = `https://www.youtube.com/embed/${links.youtube.id}`;
    mediaHTML = `
      <figure class="post-hero" style="margin:18px 0;">
        <div class="oko-embed" style="position:relative;width:100%;padding-top:56.25%;margin:12px 0;">
          <iframe src="${src}" frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowfullscreen
                  style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe>
        </div>
      </figure>`;
  } else if (links.facebook) {
    // Facebook blocks many embeds; show poster + button
    const fbBtn = `
      <div style="text-align:center;margin:12px 0;">
        <a href="${links.facebook.url}" target="_blank" rel="noopener"
           style="display:inline-block;padding:10px 16px;border-radius:10px;background:#1E90FF;color:#fff;text-decoration:none;">
          ▶ Watch on Facebook
        </a>
      </div>`;
    if (featured && featured.poster) {
      const alt = (featured.alt || title).replace(/"/g, "&quot;");
      const wAttr = featured.w ? ` width="${featured.w}"` : "";
      const hAttr = featured.h ? ` height="${featured.h}"` : "";
      mediaHTML = `
        <figure class="post-hero" style="margin:18px 0; text-align:center;">
          <img src="${featured.poster}"${wAttr}${hAttr} alt="${alt}"
               style="display:block;width:100%;height:auto;border-radius:10px;object-fit:contain;"/>
          ${fbBtn}
        </figure>`;
    } else {
      mediaHTML = `<figure class="post-hero" style="margin:18px 0;">${fbBtn}</figure>`;
    }
  } else if (featured && featured.poster) {
    const alt = (featured.alt || title).replace(/"/g, "&quot;");
    const wAttr = featured.w ? ` width="${featured.w}"` : "";
    const hAttr = featured.h ? ` height="${featured.h}"` : "";
    mediaHTML = `
      <figure class="post-hero" style="margin:18px 0;">
        <img src="${featured.poster}"${wAttr}${hAttr} alt="${alt}"
             style="display:block;width:100%;height:auto;border-radius:10px;object-fit:contain;"/>
      </figure>`;
  }

  // ---- Render page ----
  $detail.innerHTML = `
    ${mediaHTML || ""}

    <header class="post-header" style="margin:10px 0 10px 0;background:transparent;">
      <h1 class="post-title" style="margin:0 0 .35rem 0; line-height:1.2; font-size:2rem; color:#1E90FF;">
        ${title}
      </h1>
      <div class="byline" style="color:#444; font-weight:600; font-size:.95rem; margin-top:2px;">
        ${author ? `${author} • ` : ""}${date}
      </div>
    </header>

    <section class="post-content oko-content" style="margin:20px 0 28px 0; color:#111; line-height:1.65;">
      ${contentHTML}
    </section>

    <footer class="post-footer" style="margin:28px 0 0 0;">
      <a href="#/" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#1E90FF;color:#fff;text-decoration:none;">← Back to posts</a>
    </footer>
  `;

  // Make any stray iframes in content responsive (safety)
  try {
    $detail.querySelectorAll('.oko-content iframe').forEach((iframe) => {
      if (iframe.closest('.oko-embed')) return; // already wrapped
      const wrap = document.createElement('div');
      wrap.className = 'oko-embed';
      wrap.style.position = 'relative';
      wrap.style.width = '100%';
      wrap.style.paddingTop = '56.25%';
      wrap.style.margin = '12px 0';
      iframe.parentNode.insertBefore(wrap, iframe);
      iframe.style.position = 'absolute';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      wrap.appendChild(iframe);
    });
  } catch {}

  // Keep header sticky (defensive)
  try {
    const $hdr = document.querySelector("header");
    if ($hdr) {
      $hdr.style.position = "sticky";
      $hdr.style.top = "0";
      $hdr.style.zIndex = "1000";
    }
  } catch {}
}

export default renderPost;
