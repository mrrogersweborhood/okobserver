/* OkObserver Home Grid with Infinite Scroll + Video Posters
   Version: 2025-11-01v
   - Restores video posters & click-to-play on summary cards
   - Infinite scroll (sentinel outside grid) retained
*/

export async function renderHome($app, { VER } = {}) {
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const PER_PAGE = 20;
  let currentPage = 1, loading = false, done = false;
  if (!$app) return;

  // Shell: grid + external sentinel (so it doesn't reserve a grid row)
  $app.innerHTML = `
    <div id="postsGrid" class="post-grid posts-grid grid">
      <div class="loading" style="grid-column:1/-1;text-align:center;padding:1.25rem 0;">Loading…</div>
    </div>
    <div id="scrollSentinel" style="height:1px;"></div>
  `;
  const $grid = document.getElementById("postsGrid");
  const $sentinel = document.getElementById("scrollSentinel");

  // Filters
  const hideCartoons = localStorage.getItem("okobsv.hideCartoons") !== "false";
  const hideTests    = localStorage.getItem("okobsv.hideTests") !== "false";

  // --- helpers ---
  const textFromHTML = (html) => {
    const d = document.createElement("div"); d.innerHTML = html || "";
    return (d.textContent || d.innerText || "").trim();
  };
  const getAuthor = (p) => { try { return p?._embedded?.author?.[0]?.name || ""; } catch {} return ""; };
  const fmtDate = (iso) => { try { const d = new Date(iso); return d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});} catch { return ""; } };
  const escapeHtml = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const escapeAttr = (s) => escapeHtml(s).replace(/`/g,"&#96;");
  const isCartoon = (p) => {
    const t = textFromHTML(p?.title?.rendered).toLowerCase();
    if (t.includes("cartoon") || t.includes("illustration")) return true;
    try {
      const terms = (p?._embedded?.["wp:term"] || []).flat().filter(Boolean);
      for (const term of terms) {
        const n = (term?.name || "").toLowerCase();
        if (n.includes("cartoon") || n.includes("illustration")) return true;
      }
    } catch {}
    return false;
  };
  const isTest = (p) => /\b(test|lorem)\b/.test(textFromHTML(p?.title?.rendered).toLowerCase());

  // Featured (image or video poster)
  function getFeaturedInfo(p) {
    const m = p?._embedded?.["wp:featuredmedia"]?.[0] || null;
    if (!m) return null;
    const kind = (m?.media_type || "").toLowerCase(); // "image" | "video"
    const poster = m?.source_url || "";
    // common WP/video fields (varies by theme/plugins)
    const videoSrc =
      m?.media_details?.file?.endsWith(".mp4") ? m.media_details.file :
      m?.media_details?.source_url?.endsWith(".mp4") ? m.media_details.source_url :
      m?.source_url?.endsWith(".mp4") ? m.source_url :
      (m?.meta && (m.meta.video_url || m.meta.source_url)) || "";
    return { kind, poster, videoSrc, alt: m?.alt_text || "" };
  }

  const buildTitle = (p) => textFromHTML(p?.title?.rendered) || (p?.slug||"Untitled").replace(/-/g," ");
  const buildExcerpt = (p) => {
    let ex = textFromHTML(p?.excerpt?.rendered) || textFromHTML(p?.content?.rendered) || "";
    ex = ex.replace(/\s+/g," ").trim();
    if (ex.length > 160) ex = ex.slice(0,157) + "…";
    return ex;
  };

  function cardMediaHTML(p, title) {
    const f = getFeaturedInfo(p);
    const href = `#/post/${p?.id}`;
    if (!f) return `<a href="${href}" class="thumb media" aria-label="${escapeAttr(title)}"></a>`;
    // If featured is a video (or we have an mp4), render poster with play overlay
    const isVideo = f.kind === "video" || (f.videoSrc && /\.mp4($|\?)/i.test(f.videoSrc));
    if (isVideo && f.poster) {
      const poster = f.poster;
      return `
        <a href="${href}" class="thumb media is-video" aria-label="${escapeAttr(title)}"
           data-video="${escapeAttr(f.videoSrc || "")}">
          <img src="${poster}" alt="${escapeAttr(f.alt || title)}" loading="lazy" decoding="async" />
          <span class="oko-play-badge" aria-hidden="true">▶︎</span>
        </a>
      `;
    }
    // Fallback to image
    return `
      <a href="${href}" class="thumb media" aria-label="${escapeAttr(title)}">
        <img src="${f.poster}" alt="${escapeAttr(f.alt || title)}" loading="lazy" decoding="async" />
      </a>
    `;
  }

  function cardHTML(p) {
    const title = buildTitle(p);
    const author = getAuthor(p);
    const date = fmtDate(p?.date);
    const excerpt = buildExcerpt(p);
    const href = `#/post/${p?.id}`;
    return `
      <article class="post-card card">
        ${cardMediaHTML(p, title)}
        <div class="body" style="padding:14px 16px 16px;">
          <h3 style="margin:0 0 .4rem 0; line-height:1.25; font-size:1.05rem; background:transparent;">
            <a href="${href}" style="color:inherit; text-decoration:none;">${escapeHtml(title)}</a>
          </h3>
          <div class="byline" style="background:transparent; font-size:.9rem; margin:0 0 .35rem 0;">
            ${author ? `${escapeHtml(author)} • ` : ""}${date}
          </div>
          ${excerpt ? `<p style="background:transparent; margin:.25rem 0 0 0; color:#455; font-size:.95rem; line-height:1.45;">${escapeHtml(excerpt)}</p>` : ``}
        </div>
      </article>
    `;
  }

  async function fetchPosts(page=1){
    const url = `${API_BASE}/posts?_embed=1&per_page=${PER_PAGE}&page=${page}&_=${encodeURIComponent(VER || "home")}`;
    const res = await fetch(url, { credentials: "omit", cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  }

  async function loadMore(){
    if (loading || done) return;
    loading = true;
    const batch = await fetchPosts(currentPage);
    if (!batch.length){ done = true; loading = false; return; }
    const filtered = batch.filter(p=>{
      if (hideCartoons && isCartoon(p)) return false;
      if (hideTests && isTest(p)) return false;
      return true;
    });
    const html = filtered.map(cardHTML).join("");
    if (currentPage===1) $grid.innerHTML = html; else $grid.insertAdjacentHTML("beforeend", html);
    currentPage++; loading = false;

    // attach lightweight click-to-play for posters in summary
    try {
      $grid.querySelectorAll('.post-card .thumb.is-video').forEach(a=>{
        const badge = a.querySelector('.oko-play-badge');
        if (badge) badge.style.pointerEvents = "none";
        // keep default behavior (go to detail) on click; summary just shows it's a video
        // If you want inline-play on summary, uncomment below to replace poster with <video>
        // a.addEventListener('click',(e)=>{ e.preventDefault(); inlinePlay(a); });
      });
    } catch {}
  }

  // Optional inline play (currently disabled by default)
  function inlinePlay(anchor){
    const src = anchor.getAttribute('data-video');
    if (!src) return;
    anchor.innerHTML = `
      <video playsinline muted controls preload="metadata" style="width:100%;height:auto;border-radius:10px;">
        <source src="${src}" type="video/mp4">
      </video>
    `;
    const v = anchor.querySelector('video');
    try { v.play().catch(()=>{}); } catch {}
  }

  // initial load + observer
  await loadMore();
  const io = new IntersectionObserver((entries)=>{
    if (entries[0].isIntersecting && !loading && !done) loadMore();
  }, { rootMargin: "800px 0px" });
  io.observe($sentinel);
}

export default renderHome;
