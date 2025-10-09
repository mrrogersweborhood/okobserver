// detail.js — OkObserver post detail (v2.6.8)
// Fix: some posts showed a big white gap where the video/hero should be.
// Approach: we ALWAYS render a visible, clickable poster shell immediately
// (16:9 box with play overlay). Then we upgrade its image source as soon as
// we find a good poster (featured image or first content image). Clicking
// the poster opens the video in a new tab. If no video is found, we keep the
// hero as a non-clickable featured image.

const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp/v2";
const BRAND_POSTER = "Observer-Logo-2015-08-05.png"; // local fallback

function htmlDecode(str) {
  const div = document.createElement("div");
  div.innerHTML = str || "";
  return div.textContent || div.innerText || "";
}

function selectHeroSrcFromEmbedded(post) {
  const fm = post?._embedded?.["wp:featuredmedia"]?.[0];
  if (fm?.media_details?.sizes) {
    const order = ["1536x1536", "2048x2048", "full", "large", "medium_large", "medium"];
    for (const k of order) {
      const u = fm.media_details.sizes[k]?.source_url;
      if (u) return u;
    }
  }
  return fm?.source_url || null;
}

async function fetchPost(id) {
  const res = await fetch(`${API_BASE}/posts/${id}?_embed=1`);
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  return res.json();
}

function normalizeFirstParagraph(container) {
  const first = container.querySelector("p, div, section, article, blockquote");
  if (first) {
    first.style.textIndent = "0";
    first.style.marginTop = "0";
    first.style.paddingLeft = "0";
    first.style.textAlign = "left";
  }
}

function findVideoLink(parsed) {
  // 1) Any iframe src
  const iframe = parsed.querySelector("iframe");
  if (iframe?.src) return iframe.src;

  // 2) Any anchor that points to a known host
  const hosts = /facebook\.com|fb\.watch|vimeo\.com|youtube\.com|youtu\.be/i;
  const aTags = [...parsed.querySelectorAll("a[href]")];
  const hit = aTags.find(a => hosts.test(a.href));
  return hit?.href || null;
}

/** Create a visible poster shell immediately (prevents giant white gap). */
function createPosterShell({ clickable = false, href = null }) {
  const shell = document.createElement("div");
  shell.className = "embed poster-shell";
  // Visible immediately: grey 16:9 card with play overlay
  Object.assign(shell.style, {
    maxWidth: "min(900px, 92vw)",
    margin: "16px auto",
    position: "relative",
    aspectRatio: "16 / 9",
    background: "#f1f1f1",
    borderRadius: "10px",
    overflow: "hidden",
  });

  if (clickable && href) {
    shell.dataset.href = href;
    shell.style.cursor = "pointer";
    shell.title = "Open video in a new tab";
    shell.addEventListener("click", () => window.open(href, "_blank", "noopener"));
  }

  // Play overlay (SVG) to signal interactivity
  const play = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  play.setAttribute("viewBox", "0 0 100 100");
  Object.assign(play.style, {
    position: "absolute",
    width: "64px",
    height: "64px",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    opacity: clickable ? "0.9" : "0.0",
    transition: "opacity .15s ease",
    pointerEvents: "none",
  });
  play.innerHTML =
    '<circle cx="50" cy="50" r="46" fill="rgba(0,0,0,.35)"/><polygon points="40,30 72,50 40,70" fill="#fff"/>';
  shell.appendChild(play);

  shell.addEventListener("mouseenter", () => {
    if (clickable) play.style.opacity = "1";
  });
  shell.addEventListener("mouseleave", () => {
    if (clickable) play.style.opacity = "0.9";
  });

  // <img> goes inside this shell later (when we know a good URL).
  return shell;
}

function setPosterImage(shell, src) {
  // Remove any existing img
  const old = shell.querySelector("img.poster-img");
  if (old) old.remove();

  const img = document.createElement("img");
  img.className = "poster-img";
  img.alt = "Video preview";
  img.loading = "eager";
  img.decoding = "async";
  Object.assign(img.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  });
  img.src = src;

  shell.appendChild(img);
}

async function findBestPoster(post, parsed) {
  // 1) Featured media (best quality)
  const featured = selectHeroSrcFromEmbedded(post);
  if (featured) return featured;

  // 2) First inline <img> inside content
  const inline = parsed?.querySelector?.("img")?.src;
  if (inline) return inline;

  // 3) Local brand mark
  return BRAND_POSTER;
}

export async function renderPost(id) {
  const host = document.getElementById("app");
  if (!host) return;

  host.innerHTML = `
    <article class="post">
      <div id="meta"></div>
      <div id="hero-slot" aria-live="polite"></div>
      <div class="content" id="body"></div>
      <div style="margin-top:20px">
        <button class="btn" id="back">Back to posts</button>
      </div>
    </article>
  `;

  // Back button returns to home (restores infinite-scroll list)
  const back = host.querySelector("#back");
  back.addEventListener("click", () => {
    // Prefer history (keeps scroll) with a safety net:
    const t = setTimeout(() => {
      if (!location.hash || !/^#\/?$/.test(location.hash)) location.hash = "#/";
    }, 120);
    history.back();
    // If popstate fires we’re good; otherwise the timeout will kick in.
    window.addEventListener("hashchange", () => clearTimeout(t), { once: true });
  });

  try {
    const post = await fetchPost(id);

    // Meta
    const title = htmlDecode(post?.title?.rendered || "");
    const author = post?._embedded?.author?.[0]?.name || "The Oklahoma Observer";
    const date = new Date(post.date).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const meta = host.querySelector("#meta");
    meta.innerHTML = `
      <h1 style="color:#1E90FF;margin:0;">${title}</h1>
      <div class="meta-author-date">${author} • ${date}</div>
    `;

    // Parse content into a detached container so we can inspect/clean it
    const parsed = document.createElement("div");
    parsed.innerHTML = post?.content?.rendered || "";

    // Find a video link (Facebook/Vimeo/YouTube). Build visible poster shell now.
    const videoHref = findVideoLink(parsed);
    const heroSlot = host.querySelector("#hero-slot");
    const shell = createPosterShell({ clickable: !!videoHref, href: videoHref || null });
    heroSlot.appendChild(shell);

    // Resolve and set an actual poster image ASAP
    findBestPoster(post, parsed)
      .then(src => setPosterImage(shell, src || BRAND_POSTER))
      .catch(() => setPosterImage(shell, BRAND_POSTER));

    // If a FB iframe exists in content, remove it to avoid duplicate players
    parsed.querySelectorAll("iframe").forEach(f => {
      if (/facebook\.com|fb\.watch/i.test(f.src)) f.remove();
    });

    // Inject cleaned content below the hero
    const body = host.querySelector("#body");
    body.appendChild(parsed);
    normalizeFirstParagraph(body);
  } catch (err) {
    const body = host.querySelector("#body");
    if (body) body.innerHTML = `<p>Failed to load post. ${String(err)}</p>`;
  }
}
