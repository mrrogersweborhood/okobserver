// home.v263.js — Latest Posts grid with robust URL building (standalone)

// --- tiny helpers embedded here ---
const API_BASE = (window.OKO_API_BASE || "").replace(/\/+$/, ""); // drop trailing '/'

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
  try { return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); }
  catch { return iso; }
}
// --- end helpers ---

const APP = document.getElementById("app");

function postTile(p) {
  const media = p._embedded?.["wp:featuredmedia"]?.[0];
  const src = media?.media_details?.sizes?.medium_large?.source_url || media?.source_url || "";
  const title = p.title?.rendered || "(Untitled)";
  const author = p._embedded?.author?.[0]?.name || "";
  const date = prettyDate(p.date || p.date_gmt);

  return `
  <article class="post-card">
    <a class="thumb" href="#/post/${p.id}" aria-label="${title}">
      ${src ? `<img loading="lazy" src="${src}" alt="">` : ""}
    </a>
    <h3 class="post-card__title"><a href="#/post/${p.id}">${title}</a></h3>
    <div class="post-card__meta">By ${author} — ${date}</div>
    ${p.excerpt?.rendered ? `<div class="post-card__excerpt">${p.excerpt.rendered}</div>` : ""}
  </article>`;
}

async function fetchPage(page) {
  // Base, known-good query to your WP API
  return apiFetchJson("posts", {
    status: "publish",
    _embed: 1,
    per_page: 18,
    page
  });
}

export default async function renderHome() {
  if (!API_BASE) throw new Error("[Home] API base missing.");
  APP.innerHTML = `
    <section class="home">
      <h2 class="section-title">Latest Posts</h2>
      <div id="grid" class="grid"></div>
      <div id="sentinel" class="sentinel" aria-hidden="true"></div>
    </section>
  `;

  const grid = document.getElementById("grid");
  const sentinel = document.getElementById("sentinel");

  let page = 1;
  let done = false;
  let loading = false;

  async function load() {
    if (done || loading) return;
    loading = true;
    try {
      const posts = await fetchPage(page);
      if (!Array.isArray(posts) || posts.length === 0) {
        done = true;
        sentinel.remove();
        return;
      }
      grid.insertAdjacentHTML("beforeend", posts.map(postTile).join(""));
      page += 1;
    } catch (err) {
      console.error("[Home] load failed:", err);
      grid.insertAdjacentHTML("beforeend",
        `<p class="error">Failed to fetch posts: ${err.message || err}</p>`);
      done = true;
      sentinel.remove();
    } finally {
      loading = false;
    }
  }

  // initial page
  await load();

  // infinite scroll
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => e.isIntersecting && load());
  }, { rootMargin: "800px 0px 800px 0px" });
  io.observe(sentinel);
}
