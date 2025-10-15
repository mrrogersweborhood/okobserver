// home.v263.js — Posts grid (standalone, no external utils)

// ---------- helpers (embedded) ----------
const API_BASE = (window.OKO_API_BASE || "").replace(/\/+$/, "");

function joinUrl(base, path) {
  const b = (base || "").replace(/\/+$/, "");
  const p = (path || "").replace(/^\/+/, "");
  return `${b}/${p}`;
}
function qs(params = {}) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v)) v.forEach(val => u.append(k, val));
    else u.append(k, v);
  });
  const s = u.toString();
  return s ? `?${s}` : "";
}
async function apiFetchJson(pathOrUrl, params) {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl + qs(params)
    : joinUrl(API_BASE, pathOrUrl) + qs(params);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}
function prettyDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { month:"long", day:"numeric", year:"numeric" }); }
  catch { return iso; }
}
function getFeaturedSrc(post) {
  const m = post._embedded?.["wp:featuredmedia"]?.[0];
  return (
    m?.media_details?.sizes?.medium_large?.source_url ||
    m?.media_details?.sizes?.large?.source_url ||
    m?.source_url || ""
  );
}
function excerptOf(post, max = 220) {
  const tmp = document.createElement("div");
  tmp.innerHTML = post.excerpt?.rendered || post.content?.rendered || "";
  const text = tmp.textContent || "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}
// ---------- end helpers ----------

export default async function renderHome(app) {
  if (!API_BASE) {
    app.innerHTML = `<p class="error" style="color:#b00">Page error: [Home] API base missing.</p>`;
    return;
  }

  app.innerHTML = `
    <section class="home">
      <div class="container">
        <h2 class="h-title">Latest Posts</h2>
        <div id="grid" class="post-grid"></div>
        <div id="sentinel" class="sentinel" aria-hidden="true"></div>
      </div>
    </section>
  `;

  const grid = app.querySelector("#grid");
  const sentinel = app.querySelector("#sentinel");

  let page = 1;
  let loading = false;
  let done = false;

  async function loadMore() {
    if (loading || done) return;
    loading = true;
    try {
      const posts = await apiFetchJson("posts", {
        status: "publish",
        per_page: 18,
        page,
        _embed: 1
      });
      if (!Array.isArray(posts) || posts.length === 0) {
        done = true;
        sentinel.remove();
        return;
      }

      // render cards
      const html = posts.map(p => {
        const img = getFeaturedSrc(p);
        return `
          <article class="card">
            <a class="thumb" href="#/post/${p.id}" aria-label="Open post">
              ${img ? `<img src="${img}" alt="">` : ""}
            </a>
            <h3 class="card-title"><a href="#/post/${p.id}">${p.title?.rendered || "(Untitled)"}</a></h3>
            <div class="meta">By ${p._embedded?.author?.[0]?.name || "Oklahoma Observer"} — ${prettyDate(p.date || p.date_gmt)}</div>
            <p class="excerpt">${excerptOf(p)}</p>
          </article>
        `;
      }).join("");

      grid.insertAdjacentHTML("beforeend", html);
      page += 1;
    } catch (err) {
      console.error("[Home] load failed:", err);
      if (page === 1) {
        grid.innerHTML = `<p class="error" style="color:#b00">Failed to fetch posts: ${err.message || err}</p>`;
      }
      done = true; // stop hammering on failure
    } finally {
      loading = false;
    }
  }

  // infinite scroll
  const io = new IntersectionObserver((entries) => {
    const e = entries[0];
    if (e.isIntersecting) loadMore();
  }, { rootMargin: "800px 0px" });
  io.observe(sentinel);

  // initial batch
  loadMore();
}

/* ---------- styles for grid (4 columns on desktop/Windows) ---------- */
const style = document.createElement("style");
style.textContent = `
.home .container{max-width:1200px;margin:0 auto;padding:1rem}
.h-title{margin:.25rem 0 1rem}
.post-grid{
  display:grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
}
@media (max-width: 1200px){ .post-grid{ grid-template-columns: repeat(3, 1fr);} }
@media (max-width: 900px){ .post-grid{ grid-template-columns: repeat(2, 1fr);} }
@media (max-width: 560px){ .post-grid{ grid-template-columns: 1fr;} }

.card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.card .thumb{display:block;background:#f6f7f8}
.card img{display:block;width:100%;height:auto}
.card-title{font-size:1.05rem;margin:.5rem .75rem .25rem;line-height:1.2}
.card-title a{color:inherit;text-decoration:none}
.card-title a:hover{text-decoration:underline}
.meta{color:#666;font-size:.9rem;margin:0 .75rem .4rem}
.excerpt{margin:0 .75rem .9rem .75rem;color:#222}
.sentinel{height:1px}
`;
document.head.appendChild(style);
