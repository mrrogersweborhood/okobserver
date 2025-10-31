/* OkObserver Home Grid
   Version: 2025-10-31m
   Contract: renderHome($app, { VER })
   Fixes:
   - Always render visible title, byline (author • date), and excerpt.
   - Strong fallbacks when WP data is sparse (uses slug/excerpt/content).
   - Default-on filters: hide cartoons/tests unless user turns them on.
   - Lazy images + async decoding for perf.
*/

export async function renderHome($app, { VER } = {}) {
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const PER_PAGE = 20;

  if (!$app) {
    console.warn("[Home] missing mount; abort.");
    return;
  }

  // Default-hide until user opts out in Settings
  const hideCartoons = localStorage.getItem("okobsv.hideCartoons") !== "false";
  const hideTests    = localStorage.getItem("okobsv.hideTests") !== "false";

  // Shell
  $app.innerHTML = `
    <div id="postsGrid" class="post-grid posts-grid grid">
      <div class="loading" style="grid-column: 1/-1; text-align:center; padding:1.25rem 0;">
        Loading…
      </div>
    </div>
  `;
  const $grid = document.getElementById("postsGrid");

  // Fetch
  let posts = [];
  try {
    const url = `${API_BASE}/posts?_embed=1&per_page=${PER_PAGE}&page=1`;
    const res = await fetch(url, { credentials: "omit", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    posts = await res.json();
  } catch (err) {
    console.error("[Home] fetch failed:", err);
    $grid.innerHTML = `
      <div style="grid-column:1/-1; padding:1.25rem 0;">
        <h3 style="margin:0 0 .5rem 0;">Network error while loading posts.</h3>
        <div style="color:#666">Try Settings → Clear cached assets, or hard refresh.</div>
      </div>
    `;
    return;
  }

  // Helpers
  const textFromHTML = (html) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return (tmp.textContent || tmp.innerText || "").trim();
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
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch { return ""; }
  };

  // Heuristics
  const isCartoon = (p) => {
    const t = textFromHTML(p?.title?.rendered);
    if (t.toLowerCase().includes("cartoon") || t.toLowerCase().includes("illustration")) return true;
    try {
      const terms = (p?._embedded?.["wp:term"] || []).flat().filter(Boolean);
      for (const term of terms) {
        const name = (term?.name || "").toLowerCase();
        if (name.includes("cartoon") || name.includes("illustration")) return true;
      }
    } catch {}
    return false;
  };
  const isTest = (p) => {
    const t = textFromHTML(p?.title?.rendered).toLowerCase();
    return t.includes("test") || t.includes("lorem");
  };

  const filtered = posts.filter((p) => {
    if (hideCartoons && isCartoon(p)) return false;
    if (hideTests && isTest(p)) return false;
    return true;
  });

  // Card builder with strong fallbacks
  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const escapeAttr = (s) => escapeHtml(s).replace(/`/g, "&#96;");

  function buildTitle(p) {
    const title = textFromHTML(p?.title?.rendered);
    if (title) return title;
    // fallback to slug prettified
    return (p?.slug || "Untitled").replace(/-/g, " ");
  }

  function buildExcerpt(p) {
    // prefer WP excerpt; fallback to first ~160 chars of content
    let excerpt = textFromHTML(p?.excerpt?.rendered);
    if (!excerpt) excerpt = textFromHTML(p?.content?.rendered);
    if (!excerpt) return "";
    excerpt = excerpt.replace(/\s+/g, " ").trim();
    if (excerpt.length > 160) excerpt = excerpt.slice(0, 157) + "…";
    return excerpt;
  }

  function cardHTML(p) {
    const f = getFeatured(p);
    const title = buildTitle(p);
    const author = getAuthor(p);
    const date = fmtDate(p?.date);
    const excerpt = buildExcerpt(p);
    const href = `#/post/${p?.id}`;

    const img = f
      ? `<img src="${f.url}" alt="${escapeAttr(f.alt || title)}" loading="lazy" decoding="async" />`
      : "";

    // Inline, minimal, safe text styles to guarantee visibility without touching your CSS
    return `
      <article class="post-card card">
        <a href="${href}" class="thumb media" aria-label="${escapeAttr(title)}">
          ${img}
        </a>
        <div class="body" style="padding:14px 16px 16px;">
          <h3 style="margin:0 0 .4rem 0; line-height:1.25; font-size:1.05rem;">
            <a href="${href}" style="color:inherit; text-decoration:none;">${escapeHtml(title)}</a>
          </h3>
          <div class="byline" style="color:#667; font-size:.9rem; margin:0 0 .35rem 0;">
            ${author ? `${escapeHtml(author)} • ` : ""}${date}
          </div>
          ${excerpt ? `<p style="margin:.25rem 0 0 0; color:#455; font-size:.95rem; line-height:1.45;">${escapeHtml(excerpt)}</p>` : ``}
        </div>
      </article>
    `;
  }

  if (!filtered.length) {
    $grid.innerHTML = `
      <div style="grid-column:1/-1; padding:1rem 0; color:#667;">
        No posts match your filters.
      </div>
    `;
    return;
  }

  $grid.innerHTML = filtered.map(cardHTML).join("");
}

// Optional default
export default renderHome;
