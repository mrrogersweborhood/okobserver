/* OkObserver Home Grid
   Version: 2025-10-31k
   Contract: renderHome($app, { VER })
   Notes:
   - Reads user prefs from localStorage:
       okobsv.hideCartoons (boolean)
       okobsv.hideTests    (boolean)
   - Applies filters BEFORE rendering.
   - Renders a resilient grid container that matches your CSS selectors:
       id="postsGrid" and class="post-grid posts-grid grid"
   - Uses lazy images and async decoding for perf.
   - No assumptions about your header or MutationObserver.
*/

export async function renderHome($app, { VER } = {}) {
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const PER_PAGE = 20;

  // --- Mount guard ---
  if (!$app) {
    console.warn("[Home] missing mount; abort.");
    return;
  }

  // --- Preferences ---
  const hideCartoons = localStorage.getItem("okobsv.hideCartoons") === "true";
  const hideTests    = localStorage.getItem("okobsv.hideTests") === "true";

  // --- UI shell ---
  $app.innerHTML = `
    <div id="postsGrid" class="post-grid posts-grid grid">
      <div class="loading" style="grid-column: 1/-1; text-align:center; padding:1.25rem 0;">
        Loading…
      </div>
    </div>
  `;
  const $grid = document.getElementById("postsGrid");

  // --- Fetch posts (first page; keeps behavior conservative & stable) ---
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
        <div style="color:#666">Please try again from Settings (clear caches) or hard refresh.</div>
      </div>
    `;
    return;
  }

  // --- Helpers to inspect embedded data safely ---
  function getFeatured(post) {
    try {
      const m = post?._embedded?.["wp:featuredmedia"]?.[0];
      if (m?.source_url) return { url: m.source_url, alt: m.alt_text || "" };
    } catch {}
    return null;
  }
  function getAuthorName(post) {
    try {
      return post?._embedded?.author?.[0]?.name || "";
    } catch {}
    return "";
  }
  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch { return ""; }
  }
  function stripTags(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return tmp.textContent || tmp.innerText || "";
  }

  // --- Filter logic (conservative heuristics; non-destructive) ---
  function isCartoon(post) {
    const t = (stripTags(post?.title?.rendered || "").toLowerCase());
    if (t.includes("cartoon") || t.includes("illustration")) return true;
    // Try tag/category names if embedded
    try {
      const tax = [
        ...(post?._embedded?.["wp:term"]?.flat?.() || []),
      ].filter(Boolean);
      for (const term of tax) {
        const name = (term?.name || "").toLowerCase();
        if (name.includes("cartoon") || name.includes("illustration")) return true;
      }
    } catch {}
    return false;
  }
  function isTest(post) {
    const t = (stripTags(post?.title?.rendered || "").toLowerCase());
    if (t.includes("test") || t.includes("lorem")) return true;
    return false;
  }
  function applyFilters(list) {
    return list.filter(p => {
      if (hideCartoons && isCartoon(p)) return false;
      if (hideTests && isTest(p)) return false;
      return true;
    });
  }

  const filtered = applyFilters(posts);

  // --- Render cards ---
  function cardHTML(p) {
    const f = getFeatured(p);
    const title = stripTags(p?.title?.rendered || "Untitled");
    const author = getAuthorName(p);
    const date = formatDate(p?.date);
    const href = `#/post/${p?.id}`;

    const img = f
      ? `<img src="${f.url}" alt="${escapeHtmlAttr(f.alt || title)}" loading="lazy" decoding="async" />`
      : "";

    return `
      <article class="post-card card">
        <a href="${href}" class="thumb media" aria-label="${escapeHtmlAttr(title)}">
          ${img}
        </a>
        <div class="body">
          <h3 style="margin:0 0 .35rem 0; line-height:1.25;"><a href="${href}">${escapeHtml(title)}</a></h3>
          <div class="byline" style="color:#667; font-size:.9rem;">
            ${author ? `${escapeHtml(author)} • ` : ""}${date}
          </div>
        </div>
      </article>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function escapeHtmlAttr(s) { return escapeHtml(s).replace(/`/g, "&#96;"); }

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

// Optional default export for resilience with different router signatures
export default renderHome;
