// detail.js  (v2.5.4)
// Renders a post detail view with a stable "hero": either an iframe (YT/Vimeo) or a clickable poster.
// Facebook is poster-first by design. If an iframe fails (blocked / timeout), we fall back to poster.
// This file is self-contained and does not depend on api.js to avoid export drift regressions.

const API_BASE = window.OKO_API_BASE || `${location.origin}/api/wp/v2`;
const APP_EL_ID = window.OKO_APP_EL_ID || "app";

// --- Contracts we do not break ---
// 1) Detail page shows either a video iframe or a clickable poster at the top.
// 2) If Facebook link present, show a poster that opens the video in a new tab.
// 3) If iframe host blocks or times out, show a poster fallback (never blank space).
// 4) We do not render two players at once; content iframes for the chosen hero host are stripped.

const ALWAYS_POSTER_HOSTS = ["facebook.com", "m.facebook.com", "fb.watch"]; // poster-first
const IFRAME_HOSTS = ["youtube.com", "youtu.be", "vimeo.com"];             // try iframe, else poster
const IFRAME_TIMEOUT_MS = 1500;

// Public API expected by router
export async function renderPost(postId) {
  const root = document.getElementById(APP_EL_ID);
  if (!root) return console.error("[OkObserver] mount point not found:", APP_EL_ID);

  // Loading shell
  root.innerHTML = `
    <section class="post-view">
      <div class="hero" id="hero"></div>
      <header class="post-head">
        <nav class="back-row"><a href="#/" class="btn-back" id="backToPosts">← Back to posts</a></nav>
        <h1 id="post-title" class="post-title"></h1>
        <div class="post-meta" id="post-meta"></div>
      </header>
      <article class="post-body" id="post-body"></article>
    </section>
  `;

  const heroEl  = document.getElementById("hero");
  const titleEl = document.getElementById("post-title");
  const metaEl  = document.getElementById("post-meta");
  const bodyEl  = document.getElementById("post-body");

  try {
    const post = await fetchJson(`${API_BASE}/posts/${postId}?_embed=1`);

    const titleHtml = post?.title?.rendered || "";
    const date = post?.date ? new Date(post.date) : null;
    const authorName =
      post?._embedded?.author?.[0]?.name ||
      post?.yoast_head_json?.author || "—";

    titleEl.innerHTML = titleHtml;
    metaEl.textContent = [
      authorName || "",
      date ? " — " + date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : ""
    ].join("");

    // Prepare hero inputs
    const contentHtml = post?.content?.rendered || "";
    const featuredUrl = pickFeaturedImage(post);
    const videoUrl = pickFirstVideoUrl(contentHtml);

    // Build hero (iframe or poster)
    await renderHero({ heroEl, videoUrl, featuredUrl, contentHtml, postId });

    // Strip duplicate embeds for the chosen source to avoid two players
    const contentSansDup = stripEmbedIframes(contentHtml, videoUrl);
    bodyEl.innerHTML = contentSansDup;

    // Back to posts just routes #/
    const back = document.getElementById("backToPosts");
    if (back) back.addEventListener("click", () => {
      // let router handle it; nothing special here
    });

  } catch (err) {
    console.error("[OkObserver] post load failed:", err);
    heroEl.innerHTML = "";
    titleEl.textContent = "Post not found";
    metaEl.textContent = "";
    bodyEl.innerHTML = `<p>Sorry, we couldn't load this post.</p>`;
  }
}

// ---------- Helpers ----------

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const t = await safeText(r);
    throw new Error(`API Error ${r.status}: ${t?.slice(0, 200)}`);
  }
  return r.json();
}

async function safeText(r) {
  try { return await r.text(); } catch { return ""; }
}

function pickFeaturedImage(post) {
  const m = post?._embedded?.["wp:featuredmedia"]?.[0];
  if (!m) return null;
  const sizes = m?.media_details?.sizes || {};
  return (
    sizes?.large?.source_url ||
    sizes?.medium_large?.source_url ||
    sizes?.full?.source_url ||
    m?.source_url ||
    null
  );
}

// Extract first video URL from content (FB, Vimeo, YouTube)
function pickFirstVideoUrl(html) {
  if (!html) return null;
  const a = document.createElement("div");
  a.innerHTML = html;

  // any <a> that looks like video
  const candidates = [...a.querySelectorAll("a[href]")].map(el => el.getAttribute("href"));

  const byHost = (hostList) => candidates.find(href => {
    try {
      const u = new URL(href, location.href);
      return hostList.some(h => u.hostname.includes(h));
    } catch { return false; }
  });

  // prefer explicit video anchors first
  let href = byHost([...ALWAYS_POSTER_HOSTS, ...IFRAME_HOSTS]);
  if (href) return href;

  // iframes embedded
  const ifr = a.querySelector("iframe[src]");
  if (ifr) return ifr.getAttribute("src");

  return null;
}

async function renderHero({ heroEl, videoUrl, featuredUrl, contentHtml, postId }) {
  // If we have a Facebook link → poster-first
  if (isHost(videoUrl, ALWAYS_POSTER_HOSTS)) {
    const poster = await pickPoster({ featuredUrl, contentHtml });
    if (poster) {
      heroEl.innerHTML = posterMarkup(videoUrl, poster);
    } else {
      heroEl.innerHTML = ""; // nothing to show
    }
    console.info(`[OkObserver] poster-first (FB) for post ${postId}`);
    return;
  }

  // If we have a YT/Vimeo link → try iframe with timeout, then poster
  if (isHost(videoUrl, IFRAME_HOSTS)) {
    const iframeHtml = iframeMarkup(videoUrl);
    const poster = await pickPoster({ featuredUrl, contentHtml });
    try {
      const ok = await loadIframeWithTimeout(iframeHtml, IFRAME_TIMEOUT_MS);
      if (ok) {
        heroEl.innerHTML = iframeHtml;
        return;
      }
      // timeout → fallback
      if (poster) {
        heroEl.innerHTML = posterMarkup(videoUrl, poster);
        console.info(`[OkObserver] iframe timeout, poster fallback for post ${postId}`);
        return;
      }
    } catch {
      // fetch/render error → fallback
      if (poster) {
        heroEl.innerHTML = posterMarkup(videoUrl, poster);
        console.info(`[OkObserver] iframe error, poster fallback for post ${postId}`);
        return;
      }
    }
  }

  // No video → show featured if present
  if (featuredUrl) {
    heroEl.innerHTML = `
      <figure class="hero-poster no-video">
        <img src="${escapeHtml(featUrlHighRes(featuredUrl))}" alt="Featured image"/>
      </figure>`;
    return;
  }

  // Nothing at all
  heroEl.innerHTML = "";
}

function isHost(href, hostList) {
  if (!href) return false;
  try {
    const u = new URL(href, location.href);
    return hostList.some(h => u.hostname.includes(h));
  } catch { return false; }
}

function youtubeEmbed(url) {
  try {
    const u = new URL(url, location.href);
    if (u.hostname.includes("youtu.be")) {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      // already /embed/?
      if (u.pathname.includes("/embed/")) return u.href;
    }
  } catch {}
  return null;
}

function vimeoEmbed(url) {
  try {
    const u = new URL(url, location.href);
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
      if (u.hostname.startsWith("player.")) return u.href;
    }
  } catch {}
  return null;
}

function iframeMarkup(url) {
  const yt = youtubeEmbed(url);
  if (yt) return `
    <div class="hero-iframe-wrap">
      <iframe src="${yt}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>
    </div>`;

  const vm = vimeoEmbed(url);
  if (vm) return `
    <div class="hero-iframe-wrap">
      <iframe src="${vm}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
    </div>`;

  // Unrecognized → return empty (caller will poster-fallback if possible)
  return "";
}

function posterMarkup(url, posterSrc) {
  const safePoster = escapeHtml(posterSrc);
  const safeUrl = escapeHtml(url || "#");
  return `
    <a class="hero-poster" href="${safeUrl}" target="_blank" rel="noopener">
      <img src="${safePoster}" alt="Open video in a new tab"/>
      <span class="hero-play">▶</span>
    </a>`;
}

// Ensure the iframe can actually paint; resolve true on load, false on timeout
function loadIframeWithTimeout(iframeHtml, timeoutMs) {
  return new Promise((resolve) => {
    if (!iframeHtml) return resolve(false);
    // create off-DOM test container
    const test = document.createElement("div");
    test.style.position = "absolute";
    test.style.left = "-10000px";
    test.style.top = "-10000px";
    test.innerHTML = iframeHtml;
    document.body.appendChild(test);
    const ifr = test.querySelector("iframe");
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      test.remove();
      resolve(ok);
    };
    if (!ifr) return finish(false);
    const t = setTimeout(() => finish(false), timeoutMs);
    ifr.addEventListener("load", () => {
      clearTimeout(t);
      finish(true);
    });
    // onerror is not reliable for cross-origin iframes; rely on timeout instead
  });
}

async function pickPoster({ featuredUrl, contentHtml }) {
  // Prefer featured image if present
  if (featuredUrl) return featUrlHighRes(featuredUrl);

  // Else, find first <img> from content
  if (contentHtml) {
    const d = document.createElement("div");
    d.innerHTML = contentHtml;
    const img = d.querySelector("img[src]");
    if (img) return img.getAttribute("src");
  }
  return null;
}

function stripEmbedIframes(html, heroUrl) {
  if (!html || !heroUrl) return html;
  try {
    const u = new URL(heroUrl, location.href);
    const host = u.hostname;
    const d = document.createElement("div");
    d.innerHTML = html;
    [...d.querySelectorAll("iframe[src]")].forEach(ifr => {
      try {
        const ih = new URL(ifr.getAttribute("src"), location.href).hostname;
        if (ih.includes("youtube.com") && host.includes("youtube.com")) ifr.remove();
        if (ih.includes("player.vimeo.com") && host.includes("vimeo.com")) ifr.remove();
        if (ih.includes("facebook.com") && host.includes("facebook.com")) ifr.remove();
      } catch {}
    });
    return d.innerHTML;
  } catch {
    return html;
  }
}

function featUrlHighRes(src) {
  // simple upgrade for common WP "-150x150" etc
  try {
    const u = new URL(src, location.href);
    const m = u.pathname.match(/-\d+x\d+(\.\w+)$/);
    if (m) u.pathname = u.pathname.replace(/-\d+x\d+(\.\w+)$/, "$1");
    return u.href;
  } catch { return src; }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}
