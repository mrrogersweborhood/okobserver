// detail.js — OkObserver post detail (v2.6.7)
// - Poster always visible immediately (logo shown first if others slow/fail)
// - Facebook behaves like YouTube/Vimeo: try iframe, fallback to poster on fail
// - Poster thumbnail is large, centered, responsive (looks like a video card)
// - Maintains blue title, correct back button, no indent on first paragraph

const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp/v2";

function htmlDecode(str) {
  const div = document.createElement("div");
  div.innerHTML = str;
  return div.textContent || div.innerText || "";
}

function selectHeroSrcFromEmbedded(post) {
  const fm = post?._embedded?.["wp:featuredmedia"]?.[0];
  if (fm?.media_details?.sizes) {
    const order = ["1536x1536", "2048x2048", "full", "large", "medium_large", "medium"];
    for (const k of order) {
      if (fm.media_details.sizes[k]?.source_url) return fm.media_details.sizes[k].source_url;
    }
  }
  if (fm?.source_url) return fm.source_url;
  return null;
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
  const iframe = parsed.querySelector("iframe");
  if (iframe?.src) return iframe.src;
  const aTags = [...parsed.querySelectorAll("a[href]")];
  const video = aTags.find(a =>
    /facebook\.com|fb\.watch|vimeo\.com|youtube\.com|youtu\.be/i.test(a.href)
  );
  return video?.href || null;
}

/** Build a big, centered, responsive poster card that feels like a player */
function buildPosterCard(posterSrc, videoHref) {
  const wrapper = document.createElement("div");
  wrapper.className = "embed";
  // Inline sizing so it works regardless of external CSS loading order
  wrapper.style.maxWidth = "min(900px, 92vw)";
  wrapper.style.margin = "16px auto";
  wrapper.style.position = "relative";

  const a = document.createElement("a");
  a.href = videoHref;
  a.target = "_blank";
  a.rel = "noopener";
  a.style.display = "block";

  const img = document.createElement("img");
  img.className = "hero";
  img.alt = "Video preview";
  img.src = posterSrc;
  img.loading = "lazy";
  img.style.display = "block";
  img.style.width = "100%";
  img.style.height = "auto";
  img.style.borderRadius = "10px";
  img.style.cursor = "pointer";
  img.style.transition = "opacity .15s ease";

  // Hover affordance: slight dim to signal clickability
  img.addEventListener("mouseenter", () => (img.style.opacity = "0.9"));
  img.addEventListener("mouseleave", () => (img.style.opacity = "1"));

  a.appendChild(img);
  wrapper.appendChild(a);
  return wrapper;
}

async function resolvePosterSrc(post, parsed) {
  const fallbacks = [];
  const featured = selectHeroSrcFromEmbedded(post);
  if (featured) fallbacks.push(() => featured);
  const firstImg = parsed?.querySelector?.("img")?.src;
  if (firstImg) fallbacks.push(() => firstImg);
  fallbacks.push(() => "Observer-Logo-2015-08-05.png");

  for (const get of fallbacks) {
    const candidate = get();
    if (!candidate) continue;
    try {
      const img = new Image();
      img.src = candidate;
      await img.decode();
      return candidate;
    } catch {
      continue;
    }
  }
  return "Observer-Logo-2015-08-05.png";
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

  // Back button behavior (restores router's home)
  const back = host.querySelector("#back");
  back.addEventListener("click", () => {
    try {
      history.back();
      setTimeout(() => {
        if (!location.hash || !/^#\/?$/.test(location.hash)) location.hash = "#/";
      }, 120);
    } catch {
      location.hash = "#/";
    }
  });

  try {
    const post = await fetchPost(id);
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

    const tmp = document.createElement("div");
    tmp.innerHTML = post?.content?.rendered || "";
    const videoHref = findVideoLink(tmp);
    const heroSlot = host.querySelector("#hero-slot");

    if (videoHref) {
      // Show logo instantly
      const logo = "Observer-Logo-2015-08-05.png";
      heroSlot.appendChild(buildPosterCard(logo, videoHref));

      // Try to upgrade the poster as soon as a better one is ready
      resolvePosterSrc(post, tmp).then(src => {
        if (src && src !== logo) {
          heroSlot.innerHTML = "";
          heroSlot.appendChild(buildPosterCard(src, videoHref));
        }
      });

      // Remove embedded FB iframe if present to avoid duplicate players
      tmp.querySelectorAll("iframe").forEach(f => {
        if (/facebook\.com|fb\.watch/i.test(f.src)) f.remove();
      });
    }

    const body = host.querySelector("#body");
    body.appendChild(tmp);
    normalizeFirstParagraph(body);
  } catch (err) {
    const body = host.querySelector("#body");
    if (body) body.innerHTML = `<p>Failed to load post. ${String(err)}</p>`;
  }
}
