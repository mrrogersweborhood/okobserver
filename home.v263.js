// Home view — blue titles, date in meta, excludes "Cartoon", WITH infinite scroll
// ✅ Exports default at the bottom

const API_BASE = window.OKO_API_BASE;

/* ---------- helpers ---------- */
function stripHtml(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return d.textContent || "";
}

async function apiFetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  const json = await res.json();
  return { json, headers: res.headers };
}

/* ---------- category helpers ---------- */
let CARTOON_CAT_ID = null;
async function getCartoonCategoryId() {
  if (CARTOON_CAT_ID !== null) return CARTOON_CAT_ID;
  const url = `${API_BASE}/categories?per_page=100&search=cartoon&_fields=id,slug,name`;
  try {
    const { json: cats } = await apiFetchJson(url);
    const hit = Array.isArray(cats)
      ? cats.find(c => /cartoon/i.test(c?.slug || "") || /cartoon/i.test(c?.name || ""))
      : null;
    CARTOON_CAT_ID = hit ? hit.id : 0;
  } catch (_) {
    CARTOON_CAT_ID = 0; // fail-open if lookup fails
  }
  return CARTOON_CAT_ID;
}

/* ---------- data ---------- */
async function fetchPosts(page = 1, perPage = 9) {
  const cartoonId = await getCartoonCategoryId();
  const exclude = cartoonId ? `&categories_exclude=${encodeURIComponent(cartoonId)}` : "";
  const url =
    `${API_BASE}/posts?status=publish&per_page=${perPage}&page=${page}` +
    `&_embed=1&orderby=date&order=desc${exclude}`;
  return apiFetchJson(url);
}

/* ---------- rendering ---------- */
function renderCard(p) {
  const title = stripHtml(p?.title?.rendered);
  const excerpt = stripHtml(p?.excerpt?.rendered);
  const link = `#/post/${p.id}`;
  const img = p?._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";
  const author = p?._embedded?.author?.[0]?.name || "Oklahoma Observer";
  const dateStr = new Date(p.date).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric"
  });

  const article = document.createElement("article");
  article.className = "card";
  article.innerHTML = `
    <a href="${link}" class="thumb-wrap">
      ${img ? `<img class="thumb" src="${img}" alt="">` : ""}
    </a>
    <div class="card-body">
      <h2 class="title"><a href="${link}">${title}</a></h2>
      <div class="meta">By ${author} • ${dateStr}</div>
      <div class="excerpt">${excerpt}</div>
    </div>`;
  return article;
}

/* ---------- view (IO + scroll fallback) ---------- */
async function renderHome(container) {
  const host = container || document.getElementById("app");
  if (!host) { console.error("[Home] #app container missing"); return; }

  host.innerHTML = `
    <h1>Latest Posts</h1>
    <div class="grid"></div>
    <div id="scroll-sentinel" style="height:1px;"></div>
  `;
  const grid = host.querySelector(".grid");
  const sentinel = host.querySelector("#scroll-sentinel");

  let page = 1;
  let totalPages = Number.POSITIVE_INFINITY;
  let loading = false;

  async function loadPage(n) {
    if (loading) return;
    if (n > totalPages) return;
    loading = true;
    try {
      const { json, headers } = await fetchPosts(n, 9);
      const tp = parseInt(headers.get("X-WP-TotalPages") || "0", 10);
      if (tp) totalPages = tp;
      if (Array.isArray(json)) {
        const frag = document.createDocumentFragment();
        json.forEach(p => frag.appendChild(renderCard(p)));
        grid.appendChild(frag);
      }
    } catch (err) {
      console.error("[Home] load failed", err);
      const div = document.createElement("div");
      div.className = "card-body";
      div.textContent = `Failed to fetch posts: ${err.message || err}`;
      grid.appendChild(div);
    } finally {
      loading = false;
    }
  }

  // initial load
  await loadPage(page);

  // Detect scroll container
  const cs = getComputedStyle(host);
  const scrollsWithinHost = cs.overflowY === "auto" || cs.overflowY === "scroll";
  const ioRoot = scrollsWithinHost ? host : null;

  // IntersectionObserver (primary)
  let io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(async (entries) => {
      const entry = entries[0];
      if (!entry || !entry.isIntersecting) return;
      if (loading) return;
      if (page >= totalPages) {
        io && io.disconnect();
        return;
      }
      page += 1;
      await loadPage(page);
    }, { root: ioRoot, rootMargin: "800px 0px 800px 0px", threshold: 0 });
    io.observe(sentinel);
  }

  // Scroll fallback
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(async () => {
      const container = ioRoot || document.documentElement;
      const scrollTop = (ioRoot ? container.scrollTop : window.scrollY) || 0;
      const height = (ioRoot ? container.clientHeight : window.innerHeight);
      const scrollHeight = (ioRoot ? container.scrollHeight : document.documentElement.scrollHeight);

      if (!loading && page < totalPages && scrollTop + height + 1000 >= scrollHeight) {
        page += 1;
        await loadPage(page);
      }
      ticking = false;
    });
  }
  (ioRoot || window).addEventListener("scroll", onScroll, { passive: true });
}

// ✅ default export
export default renderHome;
