/* OkObserver Home Grid with Infinite Scroll + Optimized Images
   Version: 2025-11-02H10
   - Always hide cartoon posts (no toggle)
   - Immediate excerpt render
   - ID-based media selection with per-post cache-bust
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

  const textFromHTML = (html) => {
    const d = document.createElement("div"); d.innerHTML = html || "";
    return (d.textContent || d.innerText || "").trim();
  };
  const getAuthor = (p) => p?._embedded?.author?.[0]?.name || "";
  const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}); }
    catch { return ""; }
  };
  const esc = (s) => String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const escAttr = (s) => esc(s).replace(/`/g,"&#96;");

  // 🔒 Always hide cartoons
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

  // pick correct image for each post
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
    [medium, mediumLarge, large, x1536, full].forEach(x=>{
      if (x && x.width) set.push(`${x.source_url} ${x.width}w`);
    });

    return { url: base.source_url, w: base.width||fallW, h: base.height||fallH,
             alt: media?.alt_text||"", srcset:set.join(", ") };
  }

  function cardMediaHTML(p, title, indexInPage) {
    const media = pickRenditionById(p);
    const href = `#/post/${p?.id}`;
    if (!media) return `<a href="${href}" class="thumb media" aria-label="${escAttr(title)}"></a>`;
    const cb = String(p.id || 'x');
    const src = media.url.includes('?') ? `${media.url}&cb=${cb}` : `${media.url}?cb=${cb}`;
    const wAttr = media.w ? ` width="${media.w}"` : "";
    const hAttr = media.h ? ` height="${media.h}"` : "";
    const srcset = media.srcset ? ` srcset="${media.srcset}"` : "";
    const sizes = ` sizes="(max-width:640px) 92vw, (max-width:1200px) 28vw, 22vw"`;
    const fetchPri = indexInPage < 2 ? ` fetchpriority="high"` : "";
    return `
      <a href="${href}" class="thumb media" aria-label="${escAttr(title)}" data-postid="${cb}">
        <img src="${src}"${wAttr}${hAttr}${srcset}${sizes}${fetchPri}
             alt="${escAttr(media.alt||title)}" loading="lazy" decoding="async"
             referrerpolicy="no-referrer" />
      </a>`;
  }

  const buildTitle   = (p) => textFromHTML(p?.title?.rendered) || (p?.slug||"Untitled").replace(/-/g," ");
  const buildExcerpt = (p) => (textFromHTML(p?.excerpt?.rendered) || textFromHTML(p?.content?.rendered) || "").trim();

  function cardHTML(p, i) {
    const title = buildTitle(p);
    const author = getAuthor(p);
    const date = fmtDate(p?.date);
    const excerpt = buildExcerpt(p);
    const href = `#/post/${p?.id}`;
    return `
      <article class="post-card card">
        ${cardMediaHTML(p, title, i)}
        <div class="body">
          <h3 class="post-title" style="margin:0 0 .4rem;line-height:1.25;font-size:1.05rem;">
            <a href="${href}" class="title-link" style="text-decoration:none;">${esc(title)}</a>
          </h3>
          <div class="byline" style="font-size:.9rem;margin:0 0 .35rem;"><b>${esc(author)}</b> • ${date}</div>
          ${excerpt ? `<p class="excerpt">${esc(excerpt)}</p>` : ``}
        </div>
      </article>`;
  }

  async function fetchPosts(page=1){
    const url = `${API_BASE}/posts?_embed=author,wp:featuredmedia,wp:term&per_page=${PER_PAGE}&page=${page}&_=${VER||"home"}`;
    try {
      const res = await fetch(url,{cache:"no-store"});
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  }

  async function loadMore(){
    if (loading || done) return;
    loading = true;
    const batch = await fetchPosts(currentPage);
    if (!batch.length){ done=true; loading=false; return; }

    // 🔒 Always filter out cartoons
    const filtered = batch.filter(p => !isCartoon(p));

    const html = filtered.map((p,i)=>cardHTML(p,(currentPage-1)*PER_PAGE+i)).join("");
    if (currentPage===1) $grid.innerHTML=html; else $grid.insertAdjacentHTML("beforeend",html);
    currentPage++; loading=false;

    requestAnimationFrame(()=>{
      $grid.querySelectorAll("article.post-card img").forEach(img=>{
        if (!img.complete || img.naturalWidth===0){
          const u=new URL(img.src,location.href);
          u.searchParams.set("rld",Date.now()%1e7);
          img.src=u.toString();
        }
      });
    });
  }

  await loadMore();

  const io = new IntersectionObserver(e=>{
    if (e[0].isIntersecting && !loading && !done) loadMore();
  },{rootMargin:"1200px 0px"});
  io.observe($sentinel);

  $grid.addEventListener("mouseover",e=>{
    const a=e.target.closest('a[href^="#/post/"]');
    if(!a) return;
    const id=a.getAttribute("href").split("/").pop();
    fetch(`${API_BASE}/posts/${id}?_embed=wp:featuredmedia,author&_=${Date.now()%1e7}`,{cache:"force-cache"});
  },{passive:true});
}

export default renderHome;
