/* OkObserver Home Grid
   Version: 2025-11-01d
   Fix: hard-reset any accidental blue background on title/byline (inline !important)
*/

export async function renderHome($app, { VER } = {}) {
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const PER_PAGE = 20;

  if (!$app) return;

  const hideCartoons = localStorage.getItem("okobsv.hideCartoons") !== "false";
  const hideTests    = localStorage.getItem("okobsv.hideTests") !== "false";

  $app.innerHTML = `
    <div id="postsGrid" class="post-grid posts-grid grid">
      <div class="loading" style="grid-column: 1/-1; text-align:center; padding:1.25rem 0;">
        Loading…
      </div>
    </div>
  `;
  const $grid = document.getElementById("postsGrid");

  let posts = [];
  try {
    const url = `${API_BASE}/posts?_embed=1&per_page=${PER_PAGE}&page=1&_=${encodeURIComponent(VER || "home")}`;
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

  const escapeHtml = (s) => String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const escapeAttr = (s) => escapeHtml(s).replace(/`/g,"&#96;");

  const buildTitle = (p) => textFromHTML(p?.title?.rendered) || (p?.slug||"Untitled").replace(/-/g," ");
  const buildExcerpt = (p) => {
    let ex = textFromHTML(p?.excerpt?.rendered) || textFromHTML(p?.content?.rendered) || "";
    ex = ex.replace(/\s+/g," ").trim();
    if (ex.length > 160) ex = ex.slice(0,157) + "…";
    return ex;
  };

  function cardHTML(p) {
    const f = getFeatured(p);
    const title = buildTitle(p);
    const author = getAuthor(p);
    const date = fmtDate(p?.date);
    const excerpt = buildExcerpt(p);
    const href = `#/post/${p?.id}`;
    const img = f ? `<img src="${f.url}" alt="${escapeAttr(f.alt||title)}" loading="lazy" decoding="async" />` : "";

    // NB: inline background resets with !important to kill any external blue bg rules.
    const resetBg = "background:transparent !important;";

    return `
      <article class="post-card card" style="display:flex;flex-direction:column;align-items:stretch;overflow:visible;">
        <a href="${href}" class="thumb media" aria-label="${escapeAttr(title)}" style="display:block; position:relative; overflow:hidden;">
          ${img}
        </a>
        <div class="body" style="padding:14px 16px 16px; background:#fff;">
          <h3 style="${resetBg} margin:0 0 .4rem 0; line-height:1.25; font-size:1.05rem;">
            <a href="${href}" style="${resetBg} color:inherit; text-decoration:none;">${escapeHtml(title)}</a>
          </h3>
          <div class="byline" style="${resetBg} color:#667; font-size:.9rem; margin:0 0 .35rem 0;">
            ${author ? `${escapeHtml(author)} • ` : ""}${date}
          </div>
          ${excerpt ? `<p style="${resetBg} margin:.25rem 0 0 0; color:#455; font-size:.95rem; line-height:1.45;">${escapeHtml(excerpt)}</p>` : ``}
        </div>
      </article>
    `;
  }

  if (!filtered.length) {
    $grid.innerHTML = `<div style="grid-column:1/-1; padding:1rem 0; color:#667;">No posts match your filters.</div>`;
    return;
  }

  $grid.innerHTML = filtered.map(cardHTML).join("");

  // Whole card clickable (without hijacking inner links)
  try {
    $grid.querySelectorAll('.post-card').forEach(card => {
      const link = card.querySelector('a[href^="#/post/"]');
      if (!link) return;
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        const targetHash = link.getAttribute('href');
        if (targetHash) location.hash = targetHash.replace(/^#/, '');
      });
    });
  } catch {}
}

export default renderHome;
