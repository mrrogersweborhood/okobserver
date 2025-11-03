/* OkObserver Home Grid with Infinite Scroll + Optimized Images
   Version: 2025-11-02H7
   - FIX: wrong featured image bleed
     • Resolve media by ID (not array position)
     • Strict empty thumb when no media (prevents prior-image reuse)
     • Per-post cache-buster on image URLs (?cb=<postId>)
     • One-time reload safeguard for incomplete/zero-width bitmaps
   - PERF: same improvements from H6 (PER_PAGE=15, lazy excerpt mount, early IO)
*/

export async function renderHome($app, { VER } = {}) {
  const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";
  const PER_PAGE = 15;
  let currentPage = 1, loading = false, done = false;
  if (!$app) return;

  $app.innerHTML = `
    <div id="postsGrid" class="post-grid posts-grid grid">
      <div class="loading" style="text-align:center;padding:1.25rem 0;">Loading…</div>
    </div>
    <div id="scrollSentinel" style="height:1px;"></div>
  `;
  const $grid = document.getElementById("postsGrid");
  const $sentinel = document.getElementById("scrollSentinel");

  // user prefs
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

  // --- FIX: select media by actual linked ID, not array order
  function pickRenditionById(p) {
    const linkId = (() => {
      try {
        const href = p?._links?.['wp:featuredmedia']?.[0]?.href || "";
        const m = href.match(/\/media\/(\d+)/);
        return m ? Number(m[1]) : null;
      } catch { return null; }
    })();

    const mediaArr = p?._embedded?.['wp:featuredmedia'] || [];
    const media = linkId ? (mediaArr.find(x => Number(x?.id) === linkId) || mediaArr[0]) : mediaArr[0];
    if (!media) return null;

    const sizes = media?.media_details?.sizes || {};
    const fallW = media?.media_details?.width || 0;
    const fallH = media?.media_details?.height || 0;
    const get = (k) => sizes[k] && sizes[k].source_url ? sizes[k] : null;

    const medium      = get("medium");
    const mediumLarge = get("medium_large");
    const large       = get("large");
    const x1536       = get("1536x1536");
    const full        = media?.source_url ? { source_url: media.source_url, width: fallW, height: fallH } : null;

    const base = mediumLarge || large || x1536 || medium || full || null;
    if (!base) return null;

    const set = [];
    if (medium      && medium.width)      set.push(`${medium.source_url} ${medium.width}w`);
    if (mediumLarge && mediumLarge.width) set.push(`${mediumLarge.source_url} ${mediumLarge.width}w`);
    if (large       && large.width)       set.push(`${large.source_url} ${large.width}w`);
    if (x1536       && x1536.width)       set.push(`${x1536.source_url} ${x1536.width}w`);
    if (full        && full.width)        set.push(`${full.source_url} ${full.width}w`);

    return {
      url: base.source_url,
      w: base.width || fallW || 0,
      h: base.height || fallH || 0,
      alt: media?.alt_text || "",
      srcset: set.join(", ")
    };
  }

  function cardMediaHTML(p, title, indexInPage) {
    const media = pickRenditionById(p);
    const href = `#/post/${p?.id}`;
    if (!media) {
      return `<a href="${href}" class="thumb media" aria-label="${escAttr(title)}"></a>`;
    }
    const cb = String(p.id || 'x'); // per-post cache-buster
    const src = media.url.includes('?') ? `${media.url}&cb=${cb}` : `${media.url}?cb=${cb}`;
    const alt = escAttr(media.alt || title);
    const wAttr = media.w ? ` width="${media.w}"` : "";
    const hAttr = media.h ? ` height="${media.h}"` : "";
    const srcset = media.srcset ? ` srcset="${media.srcset}"` : "";
    const sizes = ` sizes="(max-width:640px) 92vw, (max-width:1200px) 28vw, 22vw"`;
    const fetchPri = indexInPage < 2 ? ` fetchpriority="high"` : "";

    return `
      <a href="${href}" class="thumb media" aria-label="${escAttr(title)}" data-postid="${cb}">
        <img
          src="${src}"${wAttr}${hAttr}${srcset}${sizes}${fetchPri}
          alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer"
        />
      </a>
    `;
  }

  const buildTitle = (p) => textFromHTML(p?.title?.rendered) || (p?.slug||"Untitled").replace(/-/g," ");
  const buildExcerpt = (p) => (textFromHTML(p?.excerpt?.rendered) || textFromHTML(p?.content?.rendered) || "").trim();

  function cardHTML(p, indexInPage) {
    const title = buildTitle(p);
    const author = getAuthor(p);
    const date = fmtDate(p?.date);
    const excerpt = buildExcerpt(p);
    const href = `#/post/${p?.id}`;
    return `
      <article class="post-card card" data-test="card">
        ${cardMediaHTML(p, title, indexInPage)}
        <div class="body">
          <h3 class="post-title" style="margin:0 0 .4rem 0; line-height:1.25; font-size:1.05rem;">
            <a href="${href}" class="title-link" style="text-decoration:none;">${esc(title)}</a>
          </h3>
          <div class="byline" style="font-size:.9rem; margin:0 0 .35rem 0;">
            ${author ? `${esc(author)} • ` : ""}${date}
          </div>
          ${excerpt ? `<p class="excerpt" data-full="${esc(excerpt)}"></p>` : ``}
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

    const html = filtered.map((p, i) =>
      cardHTML(p, (currentPage===1 ? i : i + PER_PAGE*(currentPage-1)))
    ).join("");

    if (currentPage===1) $grid.innerHTML = html; else $grid.insertAdjacentHTML("beforeend", html);
    currentPage++; loading = false;

    // Lazy mount excerpts
    mountExcerptObserver();

    // One-time reload for any incomplete/zero-width bitmaps (defensive)
    requestAnimationFrame(() => {
      $grid.querySelectorAll('article.post-card img').forEach(img => {
        if (!img.complete || img.naturalWidth === 0) {
          const u = new URL(img.src, location.href);
          u.searchParams.set('rld', String(Date.now() % 1e7));
          img.src = u.toString();
        }
      });
    });
  }

  // Excerpt IO
  let ioText;
  function mountExcerptObserver(){
    if (ioText) return;
    ioText = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        if (!e.isIntersecting) return;
        const el = e.target;
        el.textContent = el.dataset.full || "";
        ioText.unobserve(el);
      });
    }, { rootMargin: "1200px 0px" });
    $grid.querySelectorAll('.excerpt[data-full]').forEach(el=>ioText.observe(el));
  }

  // initial load
  await loadMore();

  // infinite scroll (idle attach)
  function attachObserverIdle(sentinel, cb){
    const init = () => {
      const io = new IntersectionObserver((entries)=>{
        if (entries[0].isIntersecting && !loading && !done) cb();
      }, { rootMargin: "1200px 0px" });
      io.observe(sentinel);
    };
    if ("requestIdleCallback" in window) requestIdleCallback(init);
    else setTimeout(init, 0);
  }
  attachObserverIdle($sentinel, () => loadMore());

  // speculative prefetch post detail
  $grid.addEventListener('mouseover', (e)=>{
    const a = e.target.closest('a[href^="#/post/"]');
    if (!a) return;
    const id = a.getAttribute('href').split('/').pop();
    fetch(`${API_BASE}/posts/${id}?_embed=wp:featuredmedia,author&_=${Date.now()%1e7}`, { cache:'force-cache' })
      .catch(()=>{});
  }, { passive:true });
}

export default renderHome;
