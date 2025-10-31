/* OkObserver Home Grid
   Version: 2025-10-31p
   Guarantees visible Title • Byline • Excerpt.
   Default-hide cartoons/tests; user can opt in via Settings.
*/
export async function renderHome($app, { VER } = {}) {
  console.log("[Home] boot", VER, "2025-10-31p");
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const PER_PAGE = 20;

  if (!$app) { console.warn("[Home] missing mount; abort."); return; }

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

  // Fetch (never use cached payload here)
  let posts = [];
  try {
    const url = `${API_BASE}/posts?_embed=1&per_page=${PER_PAGE}&page=1&_=${encodeURIComponent(VER)}`;
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
  const getAuthor = (p) => { try { return p?._embedded?.author?.[0]?.name || ""; } catch {} return ""; };
  const fmtDate = (iso) => { try { const d = new Date(iso); return d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});} catch { return ""; } };

  // Heuristics
  const isCartoon = (p) => {
    const t = textFromHTML(p?.title?.rendered).toLowerCase();
    if (t.includes("cartoon") || t.includes("illustration")) return true;
    try {
      const terms = (p?._embedded?.["wp:term"] || []).flat().filter(Boolean);
      for (const term of terms) {
        const name = (term?.name || "").toLowerCase();
        if (name.includes("cartoon") || name.includes("illustration")) return true;
      }
    } catch {}
    return false;
  };
  const isTest = (p) => /\b(test|lorem)\b/.test(textFromHTML(p?.title?.rendered).toLowerCase());

  const filtered = posts.filter((p) => {
    if (hideCartoons && isCartoon(p)) return false;
    if (hideTests && isTest(p)) return false;
    return true;
  });

  // Escapers
  const escapeHtml = (s) => String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const escapeAttr = (s) => escapeHtml(s).replace(/`/g,"&#96;");

  // Fallback title/excerpt
  const buildTitle = (p) => textFromHTML(p?.title?.rendered) || (p?.slug||"Untitled").replace(/-/g," ");
  const buildExcerpt = (p) => {
    let ex = textFromHTML(p?.excerpt?.rendered) || textFromHTML(p?.content?.rendered) || "";
    ex = ex.replace(/\s+/g," ").trim();
    if (ex.length > 160) ex = ex.slice(0,157) + "…";
    return ex;
  };

  // Card
  function cardHTML(p) {
    const f = getFeatured(p);
    const title = buildTitle(p);
    const author = getAuthor(p);
    const date = fmtDate(p?.date);
    const excerpt = buildExcerpt(p);
    const href = `#/post/${p?.id}`;
    const img = f ? `<img src="${f.url}" alt="${escapeAttr(f.alt||title)}" loading="lazy" decoding="async" />` : "";

    // Inline text styles to guarantee visibility
    return `
      <article class="post-card card">
        <a href="${href}" class="thumb media" aria-label="${escapeAttr(title)}">${img}</a>
        <div class="body" style="padding:14px 16px 16px;">
          <h3 style="margin:0 0 .4rem 0; line-height:1.25; font-size:1.05rem;">
            <a href="${href}" style="color:#111; text-decoration:none;">${escapeHtml(title)}</a>
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
    $grid.innerHTML = `<div style="grid-column:1/-1; padding:1rem 0; color:#667;">No posts match your filters.</div>`;
    return;
  }
  $grid.innerHTML = filtered.map(cardHTML).join("");
}

export default renderHome;
