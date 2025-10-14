// detail.v263.js — Post detail view (standalone, no external utils)

// ---------- helpers (embedded) ----------
const API_BASE = (window.OKO_API_BASE || "").replace(/\/+$/, "");

function joinUrl(base, path) {
  const b = (base || "").replace(/\/+$/, "");
  const p = (path || "").replace(/^\/+/, "");
  return `${b}/${p}`;
}

function qs(params = {}) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v)) v.forEach(val => u.append(k, val));
    else u.append(k, v);
  });
  const s = u.toString();
  return s ? `?${s}` : "";
}

async function apiFetchJson(pathOrUrl, params) {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl + qs(params)
    : joinUrl(API_BASE, pathOrUrl) + qs(params);

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

function prettyDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); }
  catch { return iso; }
}

function sanitizeHtml(html = "") {
  // Very light sanitization for embeds; keep links, iframes with safe attrs.
  return String(html)
    .replace(/\son[a-z]+="[^"]*"/gi, "")                         // strip inline handlers
    .replace(/<script[\s\S]*?<\/script>/gi, "")                  // drop scripts
    .replace(/<iframe/gi, '<iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade"')
    .replace(/<img /gi, '<img loading="lazy" ');
}

function extractFirstVideoUrl(html = "") {
  const a = document.createElement("div");
  a.innerHTML = html;

  // Prefer direct Vimeo/YouTube anchors if present
  const anchors = [...a.querySelectorAll("a[href]")].map(n => n.getAttribute("href"));
  const direct = anchors.find(h =>
    /(?:vimeo\.com|youtube\.com\/watch\?v=|youtu\.be\/)/i.test(h || "")
  );
  if (direct) return direct;

  // Or look for iframes embed
  const frame = a.querySelector("iframe[src*='vimeo.com'],iframe[src*='youtube.com'],iframe[src*='youtu.be']");
  if (frame) return frame.getAttribute("src") || null;

  return null;
}
// ---------- end helpers ----------

const APP = document.getElementById("app");

function heroBlock({ title, author, date, posterHtml }) {
  return `
  <header class="post-hero">
    <a class="backlink" href="#/posts">← Back to Posts</a>
    <h1 class="post-title">${title}</h1>
    <div class="post-meta">By ${author} — ${date}</div>
    ${posterHtml || ""}
  </header>`;
}

function posterTemplate({ posterSrc, playLabel = "Play" }) {
  if (!posterSrc) return "";
  return `
  <div class="video-poster" role="button" tabindex="0" aria-label="${playLabel}">
    <img src="${posterSrc}" alt="">
    <button class="poster-play" aria-label="${playLabel}">▶</button>
  </div>`;
}

function contentBlock(html) {
  return `<div class="post-content">${sanitizeHtml(html || "")}</div>`;
}

function footerBacklink() {
  return `<div class="post-footer"><a class="backlink" href="#/posts">← Back to Posts</a></div>`;
}

function getFeaturedSrc(post) {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  return (
    media?.media_details?.sizes?.large?.source_url ||
    media?.media_details?.sizes?.medium_large?.source_url ||
    media?.source_url || ""
  );
}

function buildPlayer(videoUrl) {
  if (!videoUrl) return "";
  // Normalize Vimeo share URLs to player URLs
  const vimeo = videoUrl.match(/vimeo\.com\/(\d+)/);
  const you = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);

  let src = videoUrl;
  if (vimeo) src = `https://player.vimeo.com/video/${vimeo[1]}`;
  if (you)   src = `https://www.youtube.com/embed/${you[1]}`;

  return `
  <div class="video-embed">
    <iframe
      src="${src}"
      allowfullscreen
      loading="lazy"
      title="Embedded video"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share">
    </iframe>
  </div>`;
}

export default async function renderDetail(app, idParam) {
  if (!API_BASE) throw new Error("[Detail] API base missing.");

  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  APP.innerHTML = `
    <section class="detail">
      <div class="container">
        <div class="loading">Loading…</div>
      </div>
    </section>
  `;

  const container = APP.querySelector(".container");

  try {
    // Fetch the post with embeds
    const post = await apiFetchJson(`posts/${id}`, { _embed: 1 });

    const title = post.title?.rendered || "(Untitled)";
    const author = post._embedded?.author?.[0]?.name || "Oklahoma Observer";
    const date = prettyDate(post.date || post.date_gmt);
    const posterSrc = getFeaturedSrc(post);

    // Detect a video URL from content
    const videoUrl = extractFirstVideoUrl(post.content?.rendered || "");

    const posterHtml = posterSrc
      ? posterTemplate({ posterSrc, playLabel: "Play video" })
      : "";

    const parts = [
      heroBlock({ title, author, date, posterHtml }),
      contentBlock(post.content?.rendered || ""),
      footerBacklink()
    ];

    container.innerHTML = parts.join("");

    // Wire poster → player swap (no autoplay; plays only on click)
    if (videoUrl && posterSrc) {
      const poster = container.querySelector(".video-poster");
      const swapToPlayer = () => {
        poster.outerHTML = buildPlayer(videoUrl);
      };
      poster?.addEventListener("click", swapToPlayer);
      poster?.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault(); swapToPlayer();
        }
      });
    }

  } catch (err) {
    console.error("[Detail] load failed:", err);
    container.innerHTML = `
      <p class="error" role="alert" style="color:#b00">
        Page error: ${err?.message || err}
      </p>`;
  }
}

/* ---------- minimal styles for nicer defaults (optional; safe to keep) ---------- */
const style = document.createElement("style");
style.textContent = `
.detail .container{max-width:980px;margin:0 auto;padding:1rem}
.backlink{display:inline-block;margin:0 0 1rem 0;color:#245; text-decoration:none}
.backlink:hover{text-decoration:underline}
.post-title{margin:0 0 .25rem 0; line-height:1.2}
.post-meta{color:#666;margin:0 0 1rem 0}
.video-poster{position:relative;display:block;max-width:100%;border-radius:10px;overflow:hidden;background:#f5f5f5}
.video-poster img{display:block;width:100%;height:auto}
.poster-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:0;border-radius:999px;padding:.75rem 1rem;font-size:1.1rem;background:#1976d2;color:white;cursor:pointer}
.video-embed{position:relative;padding-top:56.25%;border-radius:10px;overflow:hidden;background:#000;margin:.25rem 0 1rem}
.video-embed iframe{position:absolute;inset:0;width:100%;height:100%}
.post-content figure{margin:1rem 0}
.post-content img{max-width:100%;height:auto;display:block;margin:0 auto}
.post-footer{margin:2rem 0}
`;
document.head.appendChild(style);
