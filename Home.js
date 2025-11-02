/* OkObserver Home Grid with Infinite Scroll + Optimized Images
   Version: 2025-11-02H5  (full excerpts)
   - FIX: keep _embed=author,wp:featuredmedia,wp:term so filters work
   - FIX: correct requestIdleCallback usage (no invalid options)
   - PERF: PER_PAGE=18, offscreen virtualization via CSS (override.css)
   - IMG: width/height + srcset/sizes + fetchpriority for first row
   - UX: titles/bylines/excerpts preserved; EXCERPTS ARE FULL (not truncated)
   - Sentinel lives OUTSIDE the grid to avoid an empty grid row
*/

export async function renderHome($app, { VER } = {}) {
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const PER_PAGE = 18;
  let currentPage = 1, loading = false, done = false;
  if (!$app) return;

  // Shell
  $app.innerHTML = `
    <div id="postsGrid" class="post-grid posts-grid grid">
      <div class="loading" style="grid-column:1/-1;text-align:center;padding:1.25rem 0;">Loading…</div>
    </div>
    <div id="scrollSentinel" style="height:1px;"></div>
  `;
  const $grid = document.getElementById("postsGrid");
  const $sentinel = document.getElementById("scrollSentinel");

  // User prefs
  const hideCartoons = localStorage.getItem("okobsv.hideCartoons") !== "false";
  const hideTests    = localStorage.getItem("okobsv.hideTests") !== "false";

  // ---------- helpers ----------
  const textFromHTML = (html) => {
    const d = document.createElement("div"); d.innerHTML = html || "";
    return (d.textContent || d.innerText || "").trim();
  };
  const getAuthor = (p) => { try { return p?._embedded?.author?.[0]?.name || ""; } catch {} return ""; };
  const fmtDate = (iso) => { try { const d = new Date(iso); return d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});} catch { return ""; } };
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const escAttr = (s) => esc(s).replace(/`/g,"&#96;");

  // Robust cartoon/test detection
  function isCartoon(p){
    const title = textFromHTML(p?.title?.rendered).toLowerCase();
    if (/\b(cartoon|illustration|toon)\b/.test(title)) return true;
    try {
      const terms = (p?._embedded?.["wp:term"] || []).flat().filter(Boolean);
      for (const t of terms) {
        const n = (t?.name || "").toLowerCase();
        if (/\b(cartoon|illustration|comic|op-art)\b/.test(n)) return true;
      }
    } catch {}
    return false;
  }
  function isTest(p){
    const title = textFromHTML(p?.title?.rendered).toLowerCase();
    if (/\b(test|lorem|dummy)\b/.test(title)) return true;
    try {
      const terms = (p?._embedded?.["wp:term"] || []).flat().filter(Boolean);
      for (const t of terms) {
        const n = (t?.name || "").toLowerCase();
        if (/\b(test|sandbox|draft)\b/.test(n)) return true;
      }
    } catch {}
    return false;
  }

  // pick rendition + srcset
  function pickRendition(m) {
    const sizes = m?.media_details?.sizes || {};
    const fallW = m?.media_details?.width || 0;
    const fallH = m?.media_details?.height || 0;

    const get = (k) => sizes[k] && sizes[k].source_url ? sizes[k] : null;
    const medium      = get("medium");
    const mediumLarge = get("medium_large");
    const large       = get("large");
    const x1536       = get("1536x1536");
    const full        = m?.source_url ? { source_url: m.source_url, width: fallW, height: fallH } : null;

    const base = mediumLarge || large || x1536 || medium || full || null;

    const set = [];
    if (medium      && medium.width)      set.push(`${medium.source_url} ${medium.width}w`);
    if (mediumLarge && mediumLarge.width) set.push(`${mediumLarge.source_url} ${mediumLarge.width}w`);
    if (large       && large.width)       set.push(`${large.source_url} ${large.width}w`);
    if (x1536       && x1536.width)       set.push(`${x1536.source_url} ${x1536.width}w`);
    if (full        && full.width)        set.push(`${full.source_url} ${full.width}w`);

    return {
      url: base ? base.source_url : "",
      w: base?.width || fallW || 0,
      h: base?.height || fallH || 0,
      alt: m?.alt_text || "",
      srcset: set.join(", ")
    };
  }

  const buildTitle = (p) => textFromHTML(p?.title?.rendered) || (p?.slug||"Untitled").replace(/-/g," ");
  function buildExcerpt(p) {
    // FULL excerpt (no truncation) — sanitized text only
    let ex = textFromHTML(p?.excerpt?.rendered) || textFromHTML(p?.content?.rendered) || "";
    return ex.trim();
  }

  function cardMediaHTML(p, title, indexInPage) {
    const m = p?._embedded?.["wp:featuredmedia"]?.[0];
    const href = `#/post/${p?.id}`;
    if (!m) return `<a href="${href}" class="thumb media" aria-label="${escAttr(title)}"></a>`;

    const r = pickRendition(m);
    const alt = escAttr(r.alt || title);
    const wAttr = r.w ? ` width="${r.w}"` : "";
    const hAttr = r.h ? ` height="${r.h}"` : "";
    const srcset = r.srcset ? ` srcset="${r.srcset}"` : "";
    const sizes = ` sizes="(max-width: 640px) 92vw, (max-width: 1200px) 30vw, 22vw"`;
    const fetchPri = indexInPage < 4 ? ` fetchpriority="high"` : "";

    return `
      <a href="${href}" class="thumb media" aria-label="${escAttr(title)}">
        <img src="${r.url}"${wAttr}${hAttr}${srcset}${sizes}${fetchPri}
             alt="${alt}" loading="lazy" decoding="async" />
      </a>
    `;
  }

  function cardHTML(p, indexInPage) {
    const title = buildTitle(p);
    const author = getAuthor(p);
    const date = fmtDate(p?.date);
    const excerpt = buildExcerpt(p);
    const href = `#/post/${p?.id}`;

    return `
      <article class="post-card card" data-test="card">
        ${cardMediaHTML(p, title, indexInPage)}
        <div class="body" style="padding:14px 16px 16px;">
          <h3 class="post-title" style="margin:0 0 .4rem 0; line-height:1.25; font-size:1.05rem; background:transparent;">
            <a href="${href}" class="title-link" style="text-decoration:none;">${esc(title)}</a>
          </h3>
          <div class="byline" style="background:transparent; font-size:.9rem; margin:0 0 .35rem 0;">
            ${author ? `${esc(author)} • ` : ""}${date}
          </div>
          ${excerpt ? `<p style="background:transparent; margin:.25rem 0 0 0; color:#455; font-size:.95rem; line-height:1.45;">${esc(excerpt)}</p>` : ``}
        </div>
      </article>
    `;
  }

  function timeoutFetch(resource, options = {}, ms = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    return fetch(resource, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
  }

  async function fetchPosts(page=1){
    const url = `${API_BASE}/posts?_embed=author,wp:featuredmedia,wp:term&per_page=${PER_PAGE}&page=${page}&_=${encodeURIComponent(VER || "home")}`;
    try {
      const res = await timeoutFetch(url, { credentials:"omit", cache:"no-store", keepalive: false });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  async function loadMore(){
    if (loading || done) return;
    loading = true;
    const batch = await fetchPosts(currentPage);
    if (!batch.length){ done = true; loading = false; return; }

    const filtered = batch.filter(p=>{
      if (hideCartoons && isCartoon(p)) return false;
      if (hideTests && isTest(p)) return false;
      return true;
    });

    const html = filtered.map((p, i) => cardHTML(p, (currentPage===1 ? i : i + PER_PAGE*(currentPage-1)))).join("");
    if (currentPage===1) $grid.innerHTML = html; else $grid.insertAdjacentHTML("beforeend", html);
    currentPage++; loading = false;
  }

  await loadMore();

  function attachObserverIdle(sentinel, cb){
    const init = () => {
      const io = new IntersectionObserver((entries)=>{
        if (entries[0].isIntersecting && !loading && !done) cb();
      }, { rootMargin: "800px 0px" });
      io.observe(sentinel);
    };
    if ("requestIdleCallback" in window) {
      requestIdleCallback(init);
    } else {
      setTimeout(init, 0);
    }
  }
  attachObserverIdle($sentinel, () => loadMore());
}

export default renderHome;
