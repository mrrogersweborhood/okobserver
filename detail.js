// detail.js — OkObserver post detail (v2.6.5)
// - Always shows a visible, clickable poster if any video embed/iframe fails
// - Uses featured image, first inline image, or FINAL guaranteed fallback (Observer logo)
// - Keeps "Back to posts" button only at the BOTTOM

const API_BASE =
  (typeof window !== "undefined" && window.OKO_API_BASE) ||
  "https://okobserver-proxy.bob-b5c.workers.dev/wp/v2";

/* ----------------------------- tiny helpers ----------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);

function htmlDecode(str) {
  const div = document.createElement("div");
  div.innerHTML = str;
  return div.textContent || div.innerText || "";
}

function bySizePref(sizes) {
  if (!sizes || typeof sizes !== "object") return null;
  // Prefer large-ish sizes if available
  const order = ["1536x1536", "2048x2048", "full", "large", "medium_large", "medium"];
  for (const k of order) if (sizes[k]?.source_url) return sizes[k].source_url;
  // otherwise try first available
  for (const k of Object.keys(sizes)) {
    if (sizes[k]?.source_url) return sizes[k].source_url;
  }
  return null;
}

function selectHeroSrcFromEmbedded(post) {
  const fm = post?._embedded?.["wp:featuredmedia"]?.[0];
  if (fm?.media_details?.sizes) {
    const pick = bySizePref(fm.media_details.sizes);
    if (pick) return pick;
  }
  if (fm?.source_url) return fm.source_url;
  return null;
}

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Try multiple poster candidates, return a src that actually loads.
 * FINAL GUARANTEED FALLBACK: Observer logo (local).
 */
async function resolvePosterSrc(post, parsedContent) {
  const fallbacks = [];

  // 1) Featured image
  const featured = selectHeroSrcFromEmbedded(post);
  if (featured) fallbacks.push(() => featured);

  // 2) First inline image inside the post content
  const firstImg = parsedContent?.querySelector?.("img")?.getAttribute("src");
  if (firstImg) fallbacks.push(() => firstImg);

  // 3) A small neutral built-in poster (if you have one, swap filename)
  //    Keeping as optional, comment out if not present in repo.
  // fallbacks.push(() => "default-video-poster.jpg");

  for (const get of fallbacks) {
    const candidate = get();
    try {
      const ok = await preloadImage(candidate);
      return ok;
    } catch {
      // try next
    }
  }

  // 4) FINAL guaranteed fallback so the UI never shows an invisible blank box
  return "Observer-Logo-2015-08-05.png";
}

/** Fetch a single post with _embed */
async function fetchPost(id, signal) {
  const u = new URL(`${API_BASE}/posts/${id}`);
  u.searchParams.set("_embed", "1");
  const res = await fetch(u, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API Error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Normalize first real paragraph (remove odd indents/align leftover) */
function normalizeFirstParagraph(container) {
  // Use the first textual block element we control
  const first = container.querySelector(".content p, .content div, .content section, .content article, .content blockquote");
  if (first) {
    first.style.textIndent = "0";
    first.style.marginTop = "0";
    first.style.paddingLeft = "0";
    first.style.textAlign = "left";
  }
}

/** Detect likely video link (facebook/vimeo/youtube) inside parsed content */
function findVideoLink(parsed) {
  if (!parsed) return null;
  // Prefer explicit iframes
  const iframe = parsed.querySelector("iframe");
  if (iframe?.src) return iframe.src;

  // Or anchor to video host
  const aTags = [...parsed.querySelectorAll("a[href]")];
  const video = aTags.find(a =>
    /facebook\.com|fb\.watch|vimeo\.com|youtube\.com|youtu\.be/i.test(a.href)
  );
  return video?.href || null;
}

/** Build a "poster card": clickable image that opens video in a new tab. */
function buildPosterCard(posterSrc, videoHref) {
  const wrapper = document.createElement("div");
  wrapper.className = "embed";

  const a = document.createElement("a");
  a.href = videoHref;
  a.target = "_blank";
  a.rel = "noopener";

  const img = document.createElement("img");
  img.className = "hero"; // reuse existing sizing
  img.alt = "Video preview";
  img.src = posterSrc;
  img.loading = "lazy";
  img.decoding = "async";
  img.style.cursor = "pointer";
  img.style.transition = "opacity .18s ease";

  // Hover affordance
  img.addEventListener("mouseenter", () => (img.style.opacity = "0.85"));
  img.addEventListener("mouseleave", () => (img.style.opacity = "1"));

  a.appendChild(img);
  wrapper.appendChild(a);
  return wrapper;
}

/* ------------------------------- RENDER --------------------------------- */
export async function renderPost(id, { signal } = {}) {
  const host = document.getElementById("app");
  if (!host) return;

  // Skeleton while loading (don’t show Back button on top; we only show it at bottom)
  host.innerHTML = `
    <article class="post">
      <div class="meta-author-date" id="detail-meta" style="min-height:20px"></div>
      <div id="hero-slot" style="margin-top:6px"></div>
      <div class="content" id="post-body" style="min-height:40vh"></div>
      <div style="margin-top:20px">
        <button id="backBtnBottom" class="btn" type="button">Back to posts</button>
      </div>
    </article>
  `;

  // Wire the bottom button now (works even if fetch fails)
  const backBottom = $("#backBtnBottom", host);
  if (backBottom) {
    backBottom.addEventListener("click", () => {
      // Try history first so scroll restoration works, then hash as fallback
      try {
        history.back();
        // In case history.back() is a no-op (first load direct to detail), fallback shortly
        setTimeout(() => {
          if (!location.hash || !/^#\/?$/.test(location.hash)) location.hash = "#/";
        }, 120);
      } catch {
        location.hash = "#/";
      }
    });
  }

  // Load the post
  let post;
  try {
    post = await fetchPost(id, signal);
  } catch (err) {
    $("#post-body", host).innerHTML = `
      <div class="error-banner">Failed to load post. ${String(err.message || err)}</div>
    `;
    return;
  }

  // Title + meta
  const title = htmlDecode(post?.title?.rendered || "");
  const date = post?.date ? new Date(post.date) : null;
  const dateStr = date
    ? date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "";

  const authorName =
    post?._embedded?.author?.[0]?.name ||
    (Array.isArray(post?.author) ? "" : "") ||
    "The Oklahoma Observer";

  $("#detail-meta", host).innerHTML = `
    <h1 style="margin:0;color:#1E90FF">${title}</h1>
    <div class="meta-author-date">
      <span class="author">${authorName}</span>
      <span class="date">${dateStr}</span>
    </div>
  `;

  // Parse body HTML safely into a detached container
  const tmp = document.createElement("div");
  tmp.innerHTML = post?.content?.rendered || "";

  // Try to keep a visible/usable video area:
  //  A) If there is a known-host iframe and it loads, let it be.
  //  B) If not, show a poster that opens the video link in a new tab.
  const heroSlot = $("#hero-slot", host);
  const videoHref = findVideoLink(tmp);

  let insertedPoster = false;
  if (videoHref) {
    // If there's already an iframe for youtube/vimeo, we’ll let it render.
    // Facebook usually fails to embed → we use poster instead.
    const isFacebook = /facebook\.com|fb\.watch/i.test(videoHref);
    const hasKnownIframe =
      !!tmp.querySelector("iframe[src*='youtube.com'], iframe[src*='youtu.be'], iframe[src*='vimeo.com']");

    if (isFacebook || !hasKnownIframe) {
      try {
        const poster = await resolvePosterSrc(post, tmp);
        if (poster && heroSlot) {
          heroSlot.appendChild(buildPosterCard(poster, videoHref));
          insertedPoster = true;
        }
      } catch {
        // ignore; will still render content below
      }
    }
  }

  // Put the original (but lightly normalized) content under the hero
  $("#post-body", host).appendChild(tmp);
  normalizeFirstParagraph($("#post-body", host));

  // If we inserted a poster and there is a redundant big iframe, drop it to avoid "two players"
  if (insertedPoster) {
    const iframes = tmp.querySelectorAll("iframe");
    iframes.forEach((f) => {
      const src = f.getAttribute("src") || "";
      if (/facebook\.com|fb\.watch/i.test(src)) f.remove();
    });
  }
}
