/* OkObserver Post Detail (click-to-activate embeds)
   Version: 2025-11-02D4
   - _embed narrowed to author, wp:featuredmedia
   - Defers heavy iframes: shows poster + "Play" button; builds iframe on click
   - Cleans duplicate leading image in WP content when hero is shown
   - Title blue, byline bold, Back button blue; hero images contained
*/

export async function renderPost(id, { VER } = {}) {
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const $app =
    document.getElementById("app") ||
    document.querySelector("#app") ||
    document.body;

  if (!$app || !id) return;

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
      `${API_BASE}/posts/${id}?_embed=wp:featuredmedia,author&_=${encodeURIComponent(VER || "detail")}`,
      { credentials: "omit", cache: "no-store", keepalive: false }
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
  const textFromHTML = (html = "") => { const d = document.createElement("div"); d.innerHTML = html; return (d.textContent || d.innerText || "").trim(); };
  const getAuthor = (p) => { try { return p?._embedded?.author?.[0]?.name || ""; } catch {} return ""; };
  const fmtDate = (iso) => { try { const d = new Date(iso); return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return ""; } };

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
    const tmp = document.createElement("div"); tmp.innerHTML = html;
    const urls = new Set();
    const raw = (tmp.textContent || "").trim();
    const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
    (raw.match(urlRegex) || []).forEach((u) => urls.add(u.trim()));
    tmp.querySelectorAll("a[href]").forEach((a) => urls.add(a.getAttribute("href")));
    let vimeo = null, youtube = null, facebook = null;
    for (const u of urls) {
      if (!vimeo)  { const m = u.match(/vimeo\.com\/(\d+)/i); if (m && m[1]) vimeo = { id: m[1], url: u }; }
      if (!youtube){
        const vParam = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
        const short  = u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
        const shorts = u.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/);
        const vid = (vParam && vParam[1]) || (short && short[1]) || (shorts && shorts[1]) || "";
        if (vid) youtube = { id: vid, url: u };
      }
      if (!facebook && /facebook\.com\/.*\/videos\/\d+/i.test(u)) { facebook = { url: u }; }
      if (vimeo && youtube && facebook) break;
    }
    return { vimeo, youtube, facebook };
  }

  function cleanContent(html, { removeLeadingMedia } = { removeLeadingMedia: false }) {
    if (!html) return "";
    const root = document.createElement("div"); root.innerHTML = html;
    root.querySelectorAll('div.mceTemp, div[data-mce-bogus="all"]').forEach((n) => n.remove());
    if (removeLeadingMedia) {
      const first = root.firstElementChild;
      if (first && first.tagName === "P" && first.textContent.trim() === "" && first.querySelector("br")) first.remove();
      let cur = root.firstElementChild;
      if (cur) {
        const isImgBlock = cur.matches("p,div,figure") && cur.querySelector("img") && (cur.querySelector("a[href]") || cur.querySelector("img"));
        const isBareImg = cur.matches("img");
        if (isImgBlock || isBareImg) {
          cur.remove();
          while (root.firstElementChild && root.firstElementChild.textContent.trim() === "" && !root.firstElementChild.querySelector("img,video,iframe")) {
            root.firstElementChild.remove();
          }
        }
      }
    }
    return root.innerHTML;
  }

  // ---- Data ----
  const title = textFromHTML(post?.title?.rendered) || "Untitled";
  const author = getAuthor(post);
  const date = fmtDate(post?.date);
  const featured = getFeaturedInfo(post);
  const rawContentHTML = post?.content?.rendered || "";
  const links = featured && featured.mp4 ? {} : detectLinksFromContent(rawContentHTML);

  // ---- Lazy embed helpers ----
  function buttonHTML(label="Play"){
    return `<button type="button" class="button" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#1E90FF;color:#fff;border:0;cursor:pointer;">${label}</button>`;
  }
  function mountOnClick($slot, makeIframe){
    const $btn = $slot.querySelector("button"); if (!$btn) return;
    $btn.addEventListener("click", ()=>{
      const wrap = document.createElement("div");
      wrap.className = "oko-embed";
      wrap.style.cssText = "position:relative;width:100%;padding-top:56.25%;margin:12px 0;";
      const iframe = makeIframe();
      Object.assign(iframe.style, {position:"absolute",top:"0",left:"0",width:"100%",height:"100%",border:"0",borderRadius:"10px"});
      wrap.appendChild(iframe);
      $slot.replaceWith(wrap);
    }, { once:true });
  }

  // Build hero block
  let mediaHTML = "";
  let removeLeadingMediaFromContent = false;

  if (featured && featured.mp4) {
    mediaHTML = `
      <figure class="post-hero" style="margin:18px 0;">
        <video playsinline controls preload="metadata" style="width:100%;height:auto;border-radius:10px;background:#000;max-height:70vh;">
          <source src="${featured.mp4}" type="video/mp4">
        </video>
      </figure>`;
    removeLeadingMediaFromContent = true;
  } else if (links.vimeo) {
    mediaHTML = `
      <figure class="post-hero" style="margin:18px 0;text-align:center;">
        ${buttonHTML("▶ Play Vimeo")}
      </figure>`;
    removeLeadingMediaFromContent = true;
  } else if (links.youtube) {
    mediaHTML = `
      <figure class="post-hero" style="margin:18px 0;text-align:center;">
        ${buttonHTML("▶ Play YouTube")}
      </figure>`;
    removeLeadingMediaFromContent = true;
  } else if (links.facebook) {
    const fbBtn = `<a href="${links.facebook.url}" target="_blank" rel="noopener"
           class="button" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#1E90FF;color:#fff;text-decoration:none;">▶ Watch on Facebook</a>`;
    if (featured && featured.poster) {
      const alt = (featured.alt || title).replace(/"/g, "&quot;");
      const wAttr = featured.w ? ` width="${featured.w}"` : "";
      const hAttr = featured.h ? ` height="${featured.h}"` : "";
      mediaHTML = `
        <figure class="post-hero" style="margin:18px 0; text-align:center;">
          <img src="${featured.poster}"${wAttr}${hAttr} alt="${alt}"
               style="display:block;width:100%;height:auto;border-radius:10px;object-fit:contain;max-height:70vh;"/>
          <div style="margin-top:12px;">${fbBtn}</div>
        </figure>`;
    } else {
      mediaHTML = `<figure class="post-hero" style="margin:18px 0;text-align:center;">${fbBtn}</figure>`;
    }
    removeLeadingMediaFromContent = true;
  } else if (featured && featured.poster) {
    const alt = (featured.alt || title).replace(/"/g, "&quot;");
    const wAttr = featured.w ? ` width="${featured.w}"` : "";
    const hAttr = featured.h ? ` height="${featured.h}"` : "";
    mediaHTML = `
      <figure class="post-hero" style="margin:18px 0;">
        <img src="${featured.poster}"${wAttr}${hAttr} alt="${alt}"
             style="display:block;width:100%;height:auto;border-radius:10px;object-fit:contain;max-height:70vh;"/>
      </figure>`;
    removeLeadingMediaFromContent = true;
  }

  const contentHTML = cleanContent(rawContentHTML, { removeLeadingMedia: removeLeadingMediaFromContent });

  // Render
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
      <a href="#/" class="button" style="text-decoration:none;">← Back to posts</a>
    </footer>
  `;

  // Activate embeds on click (if applicable)
  try {
    if (links.vimeo) {
      const slot = $detail.querySelector('.post-hero');
      mountOnClick(slot, () => {
        const f = document.createElement('iframe');
        f.src = `https://player.vimeo.com/video/${links.vimeo.id}`;
        f.allow = "autoplay; fullscreen; picture-in-picture"; f.allowFullscreen = true;
        return f;
      });
    }
    if (links.youtube) {
      const slot = $detail.querySelector('.post-hero');
      mountOnClick(slot, () => {
        const f = document.createElement('iframe');
        f.src = `https://www.youtube.com/embed/${links.youtube.id}`;
        f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"; f.allowFullscreen = true;
        return f;
      });
    }
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
