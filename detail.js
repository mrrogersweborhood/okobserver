/* detail.js — OkObserver post detail view (robust multi-type fetch + diagnostics)
   Exports: renderPost(idOrSlug)
   Tries, in order:
     posts (id) → pages (id) → posts (slug) → pages (slug)
     → media/attachments (id)
     → known custom post types (id then slug)
   Renders hero (featured image or first content image). If a YouTube/Vimeo/Facebook
   link is present, hero is clickable and opens the video in a new tab.
   Adds a diagnostics block when nothing is found (lists all endpoints tried).
*/

const API_BASE = (window && window.OKO_API_BASE) || `${location.origin}/api/wp/v2`;

// Add any site-specific custom post types here (REST base names)
const CUSTOM_TYPES = [
  // e.g. "news", "article", "press", "story"
];

const tried = []; // collects attempted URLs for debugging/diagnostics

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
    const n = d.getDate();
    const sfx =
      (x) =>
        x % 10 === 1 && x % 100 !== 11
          ? "st"
          : x % 10 === 2 && x % 100 !== 12
          ? "nd"
          : x % 10 === 3 && x % 100 !== 13
          ? "rd"
          : "th";
    const base = d.toLocaleString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return base.replace(String(n), `${n}${sfx(n)}`);
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
  tried.push(url);
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) {
    const err = new Error(`API ${res.status}`);
    err.status = res.status;
    err.url = url;
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
  return first(
    await fetchJson(`${API_BASE}/posts?slug=${encodeURIComponent(slug)}&_embed=1`)
  );
}
async function tryPageBySlug(slug) {
  return first(
    await fetchJson(`${API_BASE}/pages?slug=${encodeURIComponent(slug)}&_embed=1`)
  );
}
async function tryMediaById(id) {
  // attachments (images, pdfs, etc.)
  return fetchJson(`${API_BASE}/media/${encodeURIComponent(id)}?_embed=1`);
}

async function tryCustomById(type, id) {
  return fetchJson(`${API_BASE}/${type}/${encodeURIComponent(id)}?_embed=1`);
}
async function tryCustomBySlug(type, slug) {
  return first(
    await fetchJson(`${API_BASE}/${type}?slug=${encodeURIComponent(slug)}&_embed=1`)
  );
}

function normalizeMediaToPost(media) {
  // Render an attachment like a quasi-post
  const caption = media?.caption?.rendered || "";
  const desc = media?.description?.rendered || "";
  const contentHTML = caption || desc || "";
  return {
    id: media?.id,
    date: media?.date || media?.date_gmt || new Date().toISOString(),
    title: { rendered: media?.title?.rendered || media?.alt_text || "Attachment" },
    content: { rendered: contentHTML },
    _embedded: {
      "wp:featuredmedia": [
        {
          source_url: media?.source_url,
          media_details: media?.media_details || {},
        },
      ],
      author: [{ name: media?.author || "Oklahoma Observer" }],
    },
  };
}

async function fetchSmart(idOrSlug) {
  // Reset diagnostics list for each call
  tried.length = 0;

  if (isNumeric(idOrSlug)) {
    // by ID: posts -> pages -> media -> custom types
    try {
      return await tryPostById(idOrSlug);
    } catch (e1) {
      if (e1.status !== 404) throw e1;
    }
    try {
      return await tryPageById(idOrSlug);
    } catch (e2) {
      if (e2.status !== 404) throw e2;
    }
    try {
      const media = await tryMediaById(idOrSlug);
      return normalizeMediaToPost(media);
    } catch (e3) {
      if (e3.status !== 404) throw e3;
    }
    for (const type of CUSTOM_TYPES) {
      try {
        return await tryCustomById(type, idOrSlug);
      } catch (e4) {
        if (e4.status !== 404) throw e4;
      }
    }
    return null;
  }

  // by slug: posts -> pages -> custom types
  const slug = String(idOrSlug || "").trim();
  try {
    const p = await tryPostBySlug(slug);
    if (p) return p;
  } catch (e5) {
    if (e5.status !== 404) throw e5;
  }
  try {
    const pg = await tryPageBySlug(slug);
    if (pg) return pg;
  } catch (e6) {
    if (e6.status !== 404) throw e6;
  }
  for (const type of CUSTOM_TYPES) {
    try {
      const hit = await tryCustomBySlug(type, slug);
      if (hit) return hit;
    } catch (e7) {
      if (e7.status !== 404) throw e7;
    }
  }
  return null;
}

// ---------------- Rendering ----------------

function render404(idOrSlug) {
  const app = document.getElementById("app");
  if (!app) return;

  const list = tried
    .map((u) => `<li><code>${esc(u.replace(location.origin, ""))}</code></li>`)
    .join("");

  app.innerHTML = `
    <div class="post-wrap">
      <div class="back-row">
        <a href="#/" class="back-btn">← Back to posts</a>
      </div>
      <div class="post">
        <h1 class="post-title">Post not found</h1>
        <p>Sorry, we couldn't load this post <strong>${esc(String(idOrSlug))}</strong>.</p>
        <details class="notfound-diagnostics">
          <summary>Diagnostics (endpoints tried)</summary>
          <ul class="mono">${list || "<li>(none)</li>"}</ul>
        </details>
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
    render404(idOrSlug);
    return;
  }

  const title = post?.title?.rendered || "Untitled";
  const author = post?._embedded?.author?.[0]?.name || "Oklahoma Observer";
  const date = ordinalDate(post?.date);

  let heroSrc =
    pickFeaturedFromEmbed(post) || extractFirstImageFromHTML(post?.content?.rendered);
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
