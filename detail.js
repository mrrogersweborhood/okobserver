/* detail.js — OkObserver post detail view
   - Exports: renderPost(id)
   - Fetches a single post with _embed=1
   - Renders a hero (featured image or first content image)
   - Makes hero clickable when a video link is discoverable
   - Post-render cleanup hides empty iframes/embeds to avoid large white gaps
*/

const API_BASE = (window && window.OKO_API_BASE) || `${location.origin}/api/wp/v2`;

// ---- Utilities -------------------------------------------------------------

function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ordinalDate(iso) {
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const sfx = (n) =>
      n % 10 === 1 && n % 100 !== 11 ? "st" :
      n % 10 === 2 && n % 100 !== 12 ? "nd" :
      n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";
    const fmt = d.toLocaleString(undefined, { month: "long", day: "numeric", year: "numeric" });
    // toLocale will not include suffix, so re-insert it
    // e.g., "September 12, 2025" -> "September 12th, 2025"
    return fmt.replace(String(day), `${day}${sfx(day)}`);
  } catch {
    return iso;
  }
}

function first(arr) { return Array.isArray(arr) && arr.length ? arr[0] : null; }

function pickFeaturedFromEmbed(post) {
  const m = post?._embedded?.["wp:featuredmedia"];
  const media = first(m);
  if (!media) return null;

  // Try a good size from media_details.sizes; otherwise use source_url
  const sizes = media?.media_details?.sizes || {};
  const preferred =
    sizes?.large?.source_url ||
    sizes?.medium_large?.source_url ||
    sizes?.full?.source_url ||
    media?.source_url ||
    null;
  return preferred || null;
}

function extractFirstImageFromHTML(html) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const img = doc.querySelector("img[src]");
    return img ? img.getAttribute("src") : null;
  } catch {
    return null;
  }
}

function findPlayableLink(html) {
  // Prefer explicit anchors; fall back to obvious video hosts in plain URLs.
  const rxUrl = /(https?:\/\/[^\s"'<>]+)/g;
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Look for anchors pointing to known video hosts
  const a = [...doc.querySelectorAll('a[href]')].find(el => {
    const u = el.getAttribute('href');
    return /youtube\.com|youtu\.be|vimeo\.com|facebook\.com\/.+\/videos/gi.test(u || "");
  });
  if (a) return a.href;

  // Otherwise scan text for a raw URL
  const text = doc.body?.textContent || "";
  const matches = text.match(rxUrl) || [];
  return matches.find(u => /youtube\.com|youtu\.be|vimeo\.com|facebook\.com\/.+\/videos/i.test(u)) || null;
}

function sanitizeHTML(html) {
  // Strip scripts only — keep iframes/images/etc (WordPress already sanitized)
  return String(html).replace(/<script[\s\S]*?<\/script>/gi, "");
}

function hideNode(node) {
  if (!node) return;
  node.style.display = "none";
  node.style.minHeight = "0";
  node.style.margin = "0";
  node.style.padding = "0";
}

// After the DOM is painted, hide empty iframes/embeds to kill white gaps
function cleanupEmptyEmbeds(container) {
  if (!container) return;

  // 1) Hide any hero-wrap with no children or zero height
  const hero = container.querySelector(".hero-wrap");
  if (hero && (hero.children.length === 0 || hero.clientHeight < 10)) {
    hideNode(hero);
  }

  // 2) If a .embed wrapper exists, hide it when its iframe is collapsed
  container.querySelectorAll(".embed, .embed .frame").forEach(wrap => {
    const iframe = wrap.querySelector("iframe");
    if (!iframe) {
      if (!wrap.textContent.trim()) hideNode(wrap);
      return;
    }
    // Defer check a tick to allow layout
    setTimeout(() => {
      const h = iframe.clientHeight || parseInt(getComputedStyle(iframe).height, 10) || 0;
      if (h < 40) hideNode(wrap.closest(".embed") || wrap);
    }, 250);
  });

  // 3) Generic iframes that paint zero height
  container.querySelectorAll("iframe").forEach(fr => {
    setTimeout(() => {
      const h = fr.clientHeight || parseInt(getComputedStyle(fr).height, 10) || 0;
      if (h < 40) hideNode(fr);
    }, 250);
  });
}

// ---- Rendering -------------------------------------------------------------

async function fetchPost(id) {
  const url = `${API_BASE}/posts/${encodeURIComponent(id)}?_embed=1`;
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

function render404(message = "Post not found") {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `
    <div class="post-wrap">
      <div class="back-row">
        <a href="#/" class="back-btn">← Back to posts</a>
      </div>
      <div class="post">
        <h1 class="post-title">${esc(message)}</h1>
        <p>Sorry, we couldn't load this post.</p>
      </div>
    </div>
  `;
}

export async function renderPost(id) {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `<div class="post-wrap"><div class="post">Loading…</div></div>`;

  let post;
  try {
    post = await fetchPost(id);
  } catch (err) {
    console.error("[OkObserver] detail fetch failed:", err);
    render404("Post not found");
    return;
  }

  const title = post?.title?.rendered || "Untitled";
  const author = post?._embedded?.author?.[0]?.name || "Oklahoma Observer";
  const date = ordinalDate(post?.date);

  // Hero source selection
  let heroSrc = pickFeaturedFromEmbed(post);
  if (!heroSrc) heroSrc = extractFirstImageFromHTML(post?.content?.rendered || "");

  // Find a playable link (YouTube/Vimeo/Facebook) to open on hero click
  const playable = findPlayableLink(post?.content?.rendered || "") || null;

  const heroHTML = heroSrc
    ? `
      <div class="hero-wrap">
        <img class="hero ${playable ? "is-clickable" : ""}" src="${esc(heroSrc)}" alt="">
      </div>`
    : `<div class="hero-wrap"></div>`;

  const html = `
    <div class="post-wrap">
      <div class="back-row">
        <a href="#/" class="back-btn">← Back to posts</a>
      </div>

      <article class="post">
        ${heroHTML}
        <h1 class="post-title">${title}</h1>
        <div class="meta">${esc(author)} — ${esc(date)}</div>

        <div class="post-content content">
          ${sanitizeHTML(post?.content?.rendered || "")}
        </div>
      </article>
    </div>
  `;

  app.innerHTML = html;

  // Add hero click → open playable link in new tab (if we found one)
  if (playable) {
    const img = app.querySelector(".hero-wrap .hero.is-clickable");
    if (img) {
      img.addEventListener("click", () => {
        try { window.open(playable, "_blank", "noopener,noreferrer"); } catch {}
      });
    }
  }

  // Final tidy: remove empty hero/embeds to prevent large blank regions
  // Run twice (immediately and after a small delay) for slow-loading embeds
  cleanupEmptyEmbeds(app);
  setTimeout(() => cleanupEmptyEmbeds(app), 600);
}
