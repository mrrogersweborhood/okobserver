/* detail.v263.js — full file */

const API = window.OKO?.API;
if (!API) {
  throw new Error("[Detail] API base missing.");
}

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
  // Remove leading &nbsp; and stray <br> that cause indents on some posts
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

export async function detail(appEl, id) {
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

  // WordPress content is trusted from your own site; render as-is (with safe CSS)
  const content = post.content?.rendered || "";

  host.innerHTML = `
    <header class="post-header">
      <h1 class="post-title">${title}</h1>
      <div class="byline">By ${author} — ${date}</div>
      ${featured ? `<figure class="featured"><img src="${featured}" alt=""></figure>` : ""}
    </header>
    <div class="post-content">${content}</div>
  `;

  // Fix quirky first paragraph indentation
  sanitizeFirstParagraphIndent(host);

  // Ensure images/embeds are fluid
  for (const img of host.querySelectorAll(".post-content img")) {
    img.loading = img.loading || "lazy";
    img.decoding = img.decoding || "async";
  }
}
