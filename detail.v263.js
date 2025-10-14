/* detail.v263.js — import-safe version (no API read at module top) */

function prettyDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function sanitizeFirstParagraphIndent(container) {
  const p = container.querySelector(".post-content p");
  if (!p) return;
  p.innerHTML = p.innerHTML
    .replace(/^(&nbsp;|\s|<br\s*\/?>)+/i, "")
    .trimStart();
}

function getFeatured(embedded) {
  const m = embedded?.["wp:featuredmedia"];
  if (Array.isArray(m) && m[0]?.source_url) return m[0].source_url;
  return null;
}

function resolveAPI() {
  // 1) window.OKO.API (preferred, set by main.js)
  let api = (window.OKO && window.OKO.API) || "";

  // 2) <meta name="oko-api" content="...">
  if (!api) {
    const m = document.querySelector('meta[name="oko-api"]');
    if (m && m.content) api = m.content.trim();
  }

  // 3) localStorage (optional fallback)
  if (!api) {
    const s = localStorage.getItem("oko_api");
    if (s) api = s.trim();
  }

  return api || "";
}

export async function detail(appEl, id) {
  const API = resolveAPI();
  if (!API) {
    appEl.innerHTML = `
      <section class="wrap">
        <p class="error">Page error: API base missing.</p>
      </section>`;
    console.error("[Detail] API base missing.");
    return;
  }

  appEl.innerHTML = `
    <section class="wrap">
      <div class="backline top">
        <a class="back" href="#/" aria-label="Back to Posts">← Back to Posts</a>
      </div>
      <article id="post" class="post"></article>
      <div class="backline bottom">
        <a class="back" href="#/" aria-label="Back to Posts">← Back to Posts</a>
      </div>
    </section>
  `;

  const host = appEl.querySelector("#post");

  const url = `${API}/wp-json/wp/v2/posts/${id}?_embed=1`;
  let post;
  try {
    const r = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    post = await r.json();
  } catch (e) {
    console.error("[Detail] fetch failed:", e);
    host.innerHTML = `<p class="error">Page error: could not load this post.</p>`;
    return;
  }

  const title = post.title?.rendered || "(untitled)";
  const author =
    post._embedded?.author?.[0]?.name ||
    post._embedded?.author?.[0]?.slug ||
    "—";
  const date = prettyDate(post.date);
  const featured = getFeatured(post._embedded);
  const content = post.content?.rendered || "";

  host.innerHTML = `
    <header class="post-header">
      <h1 class="post-title">${title}</h1>
      <div class="byline">By ${author} — ${date}</div>
      ${featured ? `<figure class="featured"><img src="${featured}" alt=""></figure>` : ""}
    </header>
    <div class="post-content">${content}</div>
  `;

  sanitizeFirstParagraphIndent(host);

  for (const img of host.querySelectorAll(".post-content img")) {
    img.loading = img.loading || "lazy";
    img.decoding = img.decoding || "async";
  }
}
