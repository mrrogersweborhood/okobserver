/* detail.js — OkObserver post detail view (resilient, no syntax errors)
   Exports: renderPost(idOrSlug)
   - Smart fetch: posts -> pages; by ID or slug
   - Renders hero (featured image or first content image)
   - Hero is clickable if a YouTube/Vimeo/Facebook link is found
   - Post-render cleanup hides empty embeds/iframes to avoid big white gaps
*/

const API_BASE = (window && window.OKO_API_BASE) || `${location.origin}/api/wp/v2`;

// ---------------- Utilities ----------------

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
    const sfx =
      (n) =>
        n % 10 === 1 && n % 100 !== 11
          ? "st"
          : n % 10 === 2 && n % 100 !== 12
          ? "nd"
          : n % 10 === 3 && n % 100 !== 13
          ? "rd"
          : "th";
    const base = d.toLocaleString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return base.replace(String(day), `${day}${sfx(day)}`);
  } catch {
    return iso;
  }
}

const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);
const isNumeric = (v) => /^\d+$/.test(String(v || "").trim());

function pickFeaturedFromEmbed(post) {
  const media = first(post?._embedded?.["wp:featuredmedia"]);
  if (!media) return null;
  const sizes = media?.media_details?.sizes || {};
  return (
    sizes?.large?.source_url ||
    sizes?.medium_large?.source_url ||
    sizes?.full?.source_url ||
    media?.source_url ||
    null
  );
}

function extractFirstImageFromHTML(html) {
  try {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    const img = doc.querySelector("img[src]");
    return img ? img.getAttribute("src") : null;
  } catch {
    return null;
  }
}

function findPlayableLink(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const a = [...doc.querySelectorAll("a[href]")].find((el) => {
    const u = el.getAttribute("href") || "";
    return /youtube\.com|youtu\.be|vimeo\.com|facebook\.com\/.+\/videos/i.test(u);
  });
  if (a) return a.href;

  const text = (doc.body && doc.body.textContent) || "";
  const rxUrl = /(https?:\/\/[^\s"'<>]+)/g;
  const matches = text.match(rxUrl) || [];
  return matches.find((u) =>
    /youtube\.com|youtu\.be|vimeo\.com|facebook\.com\/.+\/videos/i.test(u)
  ) || null;
}

function sanitizeHTML(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>/gi, "");
}

function hideNode(node) {
  if (!node) return;
  node.style.display = "none";
  node.style.minHeight = "0";
  node.style.margin = "0";
  node.style.padding = "0";
}

function cleanupEmptyEmbeds(container) {
  if (!container) return;

  const hero = container.querySelector(".hero-wrap");
  if (hero && (hero.children.length === 0 || hero.clientHeight < 10)) hideNode(hero);

  container.querySelectorAll(".embed, .embed .frame").forEach((wrap) => {
    const iframe = wrap.querySelector("iframe");
    if (!iframe) {
      if (!wrap.textContent.trim()) hideNode(wrap);
      return;
    }
    setTimeout(() => {
      const h = iframe.clientHeight || parseInt(getComputedStyle(iframe).height, 10) || 0;
      if (h < 40) hideNode(wrap.closest(".embed") || wrap);
    }, 250);
  });

  container.querySelectorAll("iframe").forEach((fr) => {
    setTimeout(() => {
      const h = fr.clientHeight || parseInt(getComputedStyle(fr).height, 10) || 0;
      if (h < 40) hideNode(fr);
    }, 250);
  });
}

// ---------------- Fetch helpers ----------------

async function fetchJson(url) {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) {
    const err = new Error(`API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function tryPostById(id) {
  return fetchJson(`${API_BASE}/posts/${encodeURIComponent(id)}?_embed=1`);
}
async function tryPageById(id) {
  return fetchJson(`${API_BASE}/pages/${encodeURIComponent(id)}?_embed=1`);
}
async function tryPostBySlug(slug) {
  const arr = await fetchJson(`${API_BASE}/posts?slug=${encodeURIComponent(slug)}&_embed=1`);
  return first(arr) || null;
}
async function tryPageBySlug(slug) {
  const arr = await fetchJson(`${API_BASE}/pages?slug=${encodeURIComponent(slug)}&_embed=1`);
  return first(arr) || null;
}

async function fetchSmart(idOrSlug) {
  if (isNumeric(idOrSlug)) {
    try {
      return await tryPostById(idOrSlug);
    } catch (e) {
      if (e.status !== 404) throw e;
      try {
        return await tryPageById(idOrSlug);
      } catch (e2) {
        if (e2.status !== 404) throw e2;
        return null;
      }
    }
  }

  const slug = String(idOrSlug || "").trim();
  let hit = await tryPostBySlug(slug).catch((e) => {
    if (e.status !== 404) throw e;
    return null;
  });
  if (hit) return hit;

  hit = await tryPageBySlug(slug).catch((e) => {
    if (e.status !== 404) throw e;
    return null;
  });
  return hit || null;
}

// ---------------- Rendering ----------------

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

export async function renderPost(idOrSlug) {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `<div class="post-wrap"><div class="post">Loading…</div></div>`;

  let post = null;
  try {
    post = await fetchSmart(idOrSlug);
  } catch (err) {
    console.error("[OkObserver] detail fetch failed:", err);
  }

  if (!post) {
    render404("Post not found");
    return;
  }

  const title = post?.title?.rendered || "Untitled";
  const author = post?._embedded?.author?.[0]?.name || "Oklahoma Observer";
  const date = ordinalDate(post?.date);

  let heroSrc = pickFeaturedFromEmbed(post) || extractFirstImageFromHTML(post?.content?.rendered);
  const playable = findPlayableLink(post?.content?.rendered || "") || null;

  const heroHTML = heroSrc
    ? `
      <div class="hero-wrap">
        <img class="hero ${playable ? "is-clickable" : ""}" src="${esc(heroSrc)}" alt="">
      </div>`
    : `<div class="hero-wrap"></div>`;

  app.innerHTML = `
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

  if (playable) {
    const img = app.querySelector(".hero-wrap .hero.is-clickable");
    if (img) {
      img.addEventListener("click", () => {
        try {
          window.open(playable, "_blank", "noopener,noreferrer");
        } catch {}
      });
    }
  }

  cleanupEmptyEmbeds(app);
  setTimeout(() => cleanupEmptyEmbeds(app), 600);
}
