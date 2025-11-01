/* OkObserver Home Grid with Infinite Scroll
   Version: 2025-11-01k2 (sentinel moved outside grid)
*/

export async function renderHome($app, { VER } = {}) {
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const PER_PAGE = 20;
  let currentPage = 1;
  let loading = false;
  let done = false;

  if (!$app) return;

  // Shell: grid + external sentinel
  $app.innerHTML = `
    <div id="postsGrid" class="post-grid posts-grid grid">
      <div class="loading" style="grid-column: 1/-1; text-align:center; padding:1.25rem 0;">Loading…</div>
    </div>
    <div id="scrollSentinel" style="height:1px;"></div>
  `;
  const $grid = document.getElementById("postsGrid");
  const $sentinel = document.getElementById("scrollSentinel");

  const hideCartoons = localStorage.getItem("okobsv.hideCartoons") !== "false";
  const hideTests = localStorage.getItem("okobsv.hideTests") !== "false";

  async function fetchPosts(page = 1) {
    const url = `${API_BASE}/posts?_embed=1&per_page=${PER_PAGE}&page=${page}&_=${encodeURIComponent(VER || "home")}`;
    const res = await fetch(url, { credentials: "omit", cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
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

    return `
      <article class="post-card card">
        <a href="${href}" class="thumb media" aria-label="${escapeAttr(title)}">${img}</a>
        <div class="body" style="padding:14px 16px 16px;">
          <h3 style="margin:0 0 .4rem 0; line-height:1.25; font-size:1.05rem; background:transparent;">
            <a href="${href}" style="color:inherit; text-decoration:none;">${escapeHtml(title)}</a>
          </h3>
          <div class="byline" style="color:#667; font-size:.9rem; margin:0 0 .35rem 0; background:transparent;">
            ${author ? `${escapeHtml(author)} • ` : ""}${date}
          </div>
          ${excerpt ? `<p style="margin:.25rem 0 0 0; color:#455; font-size:.95rem; line-height:1.45; background:transparent;">${escapeHtml(excerpt)}</p>` : ``}
        </div>
      </article>
    `;
  }

  async function loadMore() {
    if (loading || done) return;
    loading = true;

    const posts = await fetchPosts(currentPage);
    if (!posts.length) { done = true; loading = false; return; }

    const filtered = posts.filter((p) => {
      if (hideCartoons && isCartoon(p)) return false;
      if (hideTests && isTest(p)) return false;
      return true;
    });

    const html = filtered.map(cardHTML).join("");
    if (currentPage === 1) $grid.innerHTML = html;
    else $grid.insertAdjacentHTML("beforeend", html);

    currentPage++;
    loading = false;
  }

  // Initial batch
  await loadMore();

  // Observe external sentinel (no effect on grid layout)
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !loading && !done) loadMore();
  }, { rootMargin: "800px 0px" }); // prefetch a bit earlier
  observer.observe($sentinel);
}

export default renderHome;
