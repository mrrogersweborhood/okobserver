/* OkObserver Post Detail
   Version: 2025-10-31k
   Contract: renderPost(id, { VER })
   Goals:
   - Fetch single post with _embed for author/media.
   - Render article with feature media if available.
   - Place “Back to posts” ONLY at the bottom.
   - Keep DOM mount simple; do not alter header/grid/MO.
*/

export async function renderPost(id, { VER } = {}) {
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const $app =
    document.getElementById("app") ||
    document.querySelector("#app") ||
    document.querySelector("main") ||
    document.body;

  if (!$app || !id) return;

  $app.innerHTML = `<div class="loading" style="padding:1.25rem 0;">Loading…</div>`;

  let post = null;
  try {
    const res = await fetch(`${API_BASE}/posts/${id}?_embed=1`, { credentials: "omit", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    post = await res.json();
  } catch (err) {
    console.error("[PostDetail] fetch failed:", err);
    $app.innerHTML = `
      <div style="padding:1.25rem 0;">
        <h3 style="margin:0 0 .5rem 0;">Failed to load post.</h3>
        <div style="color:#666">Please try again later.</div>
        <div style="margin-top:1rem;"><a href="#/" aria-label="Back to posts">← Back to posts</a></div>
      </div>
    `;
    return;
  }

  // --- Helpers ---
  function stripTags(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return tmp.textContent || tmp.innerText || "";
  }
  function getFeatured(post) {
    try {
      const m = post?._embedded?.["wp:featuredmedia"]?.[0];
      if (!m) return null;
      return {
        url: m.source_url || "",
        alt: m.alt_text || "",
        type: m.media_type || "image"
      };
    } catch { return null; }
  }
  function getAuthorName(post) {
    try {
      return post?._embedded?.author?.[0]?.name || "";
    } catch { return ""; }
  }
  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch { return ""; }
  }
  function sanitizeArticleHTML(html) {
    // Gentle sanitizer: remove <script> and inline event handlers.
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    tmp.querySelectorAll("script").forEach(s => s.remove());
    tmp.querySelectorAll("*").forEach(el => {
      [...el.attributes].forEach(a => {
        if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      });
    });
    return tmp.innerHTML;
  }

  const title = stripTags(post?.title?.rendered || "Untitled");
  const author = getAuthorName(post);
  const date = formatDate(post?.date);
  const featured = getFeatured(post);
  const contentHTML = sanitizeArticleHTML(post?.content?.rendered || "");

  const mediaBlock = featured?.url
    ? `<figure class="media" style="margin:0 0 16px 0;">
         <img src="${featured.url}" alt="${escapeHtmlAttr(featured.alt || title)}" loading="lazy" decoding="async" style="width:100%; height:auto; display:block;" />
       </figure>`
    : "";

  $app.innerHTML = `
    <article class="post-detail" style="max-width:900px; margin:0 auto; padding:12px;">
      <header style="margin:8px 0 12px;">
        <h1 style="margin:0 0 6px 0; line-height:1.2;">${escapeHtml(title)}</h1>
        <div class="byline" style="color:#667; font-size:.95rem;">
          ${author ? `${escapeHtml(author)} • ` : ""}${date}
        </div>
      </header>

      ${mediaBlock}

      <section class="content">
        ${contentHTML}
      </section>

      <footer style="margin-top:28px;">
        <a href="#/" aria-label="Back to posts">← Back to posts</a>
      </footer>
    </article>
  `;

  // Ensure images within article content are lazy where possible
  try {
    $app.querySelectorAll(".content img").forEach(img => {
      if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
      if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.style.display = "block";
    });
  } catch {}
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeHtmlAttr(s) { return escapeHtml(s).replace(/`/g, "&#96;"); }

// Optional default export for router resilience
export default renderPost;
