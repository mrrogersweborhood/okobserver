/* OkObserver Post Detail with Video Diagnostics
   Version: 2025-11-02d
   - Featured video: poster with ▶ overlay → click swaps to real <video>
   - Responsive iframes inside content
   - Title (OkObserver blue) + bold byline beneath media
   - NEW: Diagnostics show when no playable video source is present
*/

export async function renderPost(id, { VER } = {}) {
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const $app = document.getElementById("app") || document.querySelector("#app") || document.body;
  if (!$app || !id) return;

  $app.innerHTML = `
    <article class="post-detail" style="max-width:980px;margin:0 auto;padding:18px 14px 60px;">
      <div class="loading" style="text-align:center;padding:1.25rem 0;">Loading…</div>
    </article>
  `;
  const $detail = $app.querySelector(".post-detail");

  let post=null;
  try{
    const res = await fetch(`${API_BASE}/posts/${id}?_embed=1&_=${encodeURIComponent(VER||"detail")}`, { credentials:"omit", cache:"no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    post = await res.json();
  }catch(err){
    console.error("[PostDetail] fetch failed:", err);
    $detail.innerHTML = `
      <h2>Unable to load this post.</h2>
      <footer style="margin-top:28px;"><a href="#/" class="btn-back">← Back to posts</a></footer>`;
    return;
  }

  // helpers
  const textFromHTML=(h="")=>{const d=document.createElement("div");d.innerHTML=h;return (d.textContent||d.innerText||"").trim();};
  const getAuthor=(p)=>{try{return p?._embedded?.author?.[0]?.name||"";}catch{}return "";};
  const fmtDate=(iso)=>{try{const d=new Date(iso);return d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});}catch{return "";}};

  function getFeaturedInfo(p){
    const m = p?._embedded?.["wp:featuredmedia"]?.[0] || null;
    if (!m) return null;
    // Try to discover a direct mp4 or a hint that it's a video
    const kind = (m?.media_type||"").toLowerCase(); // "image" | "video"
    const poster = m?.source_url || "";
    const md = m?.media_details || {};
    const meta = m?.meta || {};
    const possible = [
      md?.source_url, md?.file, m?.source_url, meta?.video_url, meta?.source_url
    ].filter(Boolean);

    const videoSrc = possible.find(u => /\.mp4($|\?)/i.test(u)) || ""; // only mp4 for native <video>
    // Diagnostics in console to help verify what WP returns
    // eslint-disable-next-line no-console
    console.log("[PostDetail] featuredmedia diagnostics:", { kind, poster, videoSrc, media_details: md, meta });

    return { kind, poster, videoSrc, alt: m?.alt_text || "" };
  }

  // data
  const title = textFromHTML(post?.title?.rendered) || "Untitled";
  const author = getAuthor(post);
  const date = fmtDate(post?.date);
  const featured = getFeaturedInfo(post);
  const contentHTML = post?.content?.rendered || "";

  // Pick what to render in the hero:
  // 1) If we have an mp4 source → poster with play overlay (click swaps to <video>)
  // 2) Else if we only have an image poster → show image + DIAGNOSTIC chip "No video source"
  const hasVideo = !!(featured && (featured.videoSrc && /\.mp4($|\?)/i.test(featured.videoSrc)));

  $detail.innerHTML = `
    ${featured ? `
      <figure class="post-hero" style="margin:18px 0; position:relative;">
        ${ hasVideo && featured.poster ? `
            <div class="oko-video-poster" data-video="${featured.videoSrc || ""}" style="position:relative;cursor:pointer;">
              <img src="${featured.poster}" alt="${(featured.alt||title).replace(/"/g,'&quot;')}"
                   style="display:block;width:100%;height:auto;border-radius:10px;background:#000"/>
              <span class="oko-play-badge" aria-hidden="true">▶︎</span>
            </div>
        ` : `
            <div class="oko-video-fallback" style="position:relative;">
              ${featured.poster ? `
                <img src="${featured.poster}" alt="${(featured.alt||title).replace(/"/g,'&quot;')}"
                     style="display:block;width:100%;height:auto;border-radius:10px;background:#000"/>
              ` : ``}
              <span class="oko-no-video-chip" title="No playable video source detected">No video source</span>
            </div>
        `}
      </figure>
    ` : ``}

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
      <a href="#/" class="btn-back" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#1E90FF;color:#fff;text-decoration:none;">← Back to posts</a>
    </footer>
  `;

  // click-to-play swap for featured poster (only when we had a real mp4)
  try {
    const poster = $detail.querySelector(".oko-video-poster");
    if (poster) {
      poster.addEventListener("click", ()=>{
        const src = poster.getAttribute("data-video");
        if (!src) return;
        poster.outerHTML = `
          <video playsinline controls autoplay muted preload="metadata" style="width:100%;height:auto;border-radius:10px;background:#000;">
            <source src="${src}" type="video/mp4">
          </video>
        `;
      }, { once:true });
    }
  } catch {}

  // make iframes responsive in content (YouTube/Vimeo/Wistia etc.)
  try {
    $detail.querySelectorAll('.oko-content iframe').forEach(iframe=>{
      const wrap = document.createElement('div');
      wrap.style.position = 'relative';
      wrap.style.width = '100%';
      wrap.style.paddingTop = '56.25%'; // 16:9
      wrap.style.margin = '12px 0';
      iframe.parentNode.insertBefore(wrap, iframe);
      iframe.style.position = 'absolute';
      iframe.style.top = '0'; iframe.style.left = '0';
      iframe.style.width = '100%'; iframe.style.height = '100%';
      wrap.appendChild(iframe);
    });
  } catch {}

  // Keep header sticky (defensive)
  try {
    const $hdr = document.querySelector("header");
    if ($hdr) { $hdr.style.position = "sticky"; $hdr.style.top = "0"; $hdr.style.zIndex = "1000"; }
  } catch {}
}

export default renderPost;
