/* OkObserver Post Detail
   Version: 2025-11-01g
   Contract: renderPost(id:number, { VER })
   Goals:
   - Featured image appears first.
   - Title (blue) and byline appear directly beneath the featured image.
   - Clean white background (no blue bar).
   - Back to posts button only at the bottom.
   - No ES module syntax; safe for GH Pages.
*/

export async function renderPost(id, { VER } = {}) {
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const $app =
    document.getElementById("app") ||
    document.querySelector("#app") ||
    document.body;

  if (!$app || !id) return;

  // Shell
  $app.innerHTML = `
    <article class="post-detail" style="max-width:980px;margin:0 auto;padding:18px 14px 60px;">
      <div class="loading" style="text-align:center;padding:1.25rem 0;">Loading…</div>
    </article>
  `;
  const $detail = $app.querySelector(".post-detail");

  // Fetch post
  let post = null;
  try {
    const res = await fetch(
      `${API_BASE}/posts/${id}?_embed=1&_=${encodeURIComponent(VER || "detail")}`,
      { credentials: "omit", cache: "no-store" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    post = await res.json();
  } catch (err) {
    console.error("[PostDetail] fetch failed:", err);
    $detail.innerHTML = `
      <h2 style="margin:0 0 .5rem 0;">Unable to load this post.</h2>
      <p style="color:#666">Please try again, or return to the post list.</p>
      <footer style="margin-top:28px;">
        <a href="#/" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#f2f4f7;color:#111;border:1px solid #dcdfe4;text-decoration:none;">← Back to posts</a>
      </footer>
    `;
    return;
  }

  // Helpers
  const textFromHTML = (html = "") => {
    const d = document.createElement("div");
    d.innerHTML = html;
    return (d.textContent || d.innerText || "").trim();
  };
  const getFeatured = (p) => {
    try {
      const m = p?._embedded?.["wp:featuredmedia"]?.[0];
      if (m?.source_url) return { url: m.source_url, alt: m.alt_text || "" };
    } catch {}
    return null;
  };
  const getAuthor = (p) => {
    try {
      return p?._embedded?.author?.[0]?.name || "";
    } catch {}
    return "";
  };
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  // Data
  const title = textFromHTML(post?.title?.rendered) || "Untitled";
  const author = getAuthor(post);
  const date = fmtDate(post?.date);
  const featured = getFeatured(post);
  const contentHTML = post?.content?.rendered || "";

  // Render — featured image first, then title/byline
  $detail.innerHTML = `
    ${featured ? `
      <figure class="post-hero" style="margin:18px 0;">
        <img src="${featured.url}" alt="${(featured.alt || title).replace(/"/g,'&quot;')}"
             style="display:block;width:100%;height:auto;border-radius:10px;" loading="lazy" decoding="async"/>
      </figure>` : ``}

    <header class="post-header" style="margin:10px 0 10px 0;background:transparent;">
      <h1 class="post-title" style="margin:0 0 .35rem 0; line-height:1.2; font-size:2rem; color:#1E90FF; background:transparent;">
        ${title}
      </h1>
      <div class="byline" style="color:#555; font-size:.95rem; margin-top:2px; background:transparent;">
        ${author ? `${author} • ` : ""}${date}
      </div>
    </header>

    <section class="post-content" style="margin:20px 0 28px 0; color:#111; line-height:1.6;">
      ${contentHTML}
    </section>

    <footer class="post-footer" style="margin:28px 0 0 0;">
      <a href="#/" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#f2f4f7;color:#111;border:1px solid #dcdfe4;text-decoration:none;">← Back to posts</a>
    </footer>
  `;

  // Ensure links open safely
  try {
    $detail.querySelectorAll('.post-content a[href]').forEach(a => {
      a.setAttribute('target','_blank');
      a.setAttribute('rel','noopener');
    });
  } catch {}

  // Keep header sticky (defensive)
  try {
    const $hdr = document.querySelector("header");
    if ($hdr) {
      $hdr.style.position = "sticky";
      $hdr.style.top = "0";
      $hdr.style.zIndex = "1000";
    }
  } catch {}
}

export default renderPost;
