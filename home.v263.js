/* home.v263.js — full file */

const API = window.OKO?.API;
if (!API) {
  throw new Error("[Home] API base missing.");
}

function prettyDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function isCartoon(embedded) {
  // Defensive: check both tags & categories for a slug match we don't want
  const terms = [
    ...(embedded?.["wp:term"]?.flat?.() ?? []),
    ...(embedded?.["wp:term"]?.flat?.() ?? []),
  ].flat();
  if (!terms || !terms.length) return false;
  return terms.some(t => {
    const slug = (t?.slug || "").toLowerCase();
    return slug === "cartoon" || slug === "cartoons";
  });
}

function getFeatured(embedded) {
  const m = embedded?.["wp:featuredmedia"];
  if (Array.isArray(m) && m[0]?.source_url) return m[0].source_url;
  return null;
}

function postCardHTML(p) {
  const img = getFeatured(p._embedded);
  const author =
    p._embedded?.author?.[0]?.name ||
    p._embedded?.author?.[0]?.slug ||
    "—";
  const date = prettyDate(p.date);
  const title = p.title?.rendered || "(untitled)";
  const excerpt = (p.excerpt?.rendered || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  return `
    <article class="card">
      <a class="card-link" href="#/post/${p.id}" aria-label="${title.replace(/"/g,'&quot;')}">
        <div class="thumb">${img ? `<img src="${img}" alt="">` : ""}</div>
        <h3 class="card-title">${title}</h3>
      </a>
      <div class="meta">By ${author} — ${date}</div>
      <div class="excerpt">${excerpt}</div>
    </article>
  `;
}

export async function home(appEl) {
  appEl.innerHTML = `
    <section class="wrap">
      <h1 class="page-title">Latest Posts</h1>
      <div id="grid" class="grid"></div>
      <div id="sentinel" class="sentinel" aria-hidden="true"></div>
    </section>
  `;

  const grid = appEl.querySelector("#grid");
  const sentinel = appEl.querySelector("#sentinel");

  let page = 1;
  let loading = false;
  let exhausted = false;

  async function loadPage() {
    if (loading || exhausted) return;
    loading = true;

    // Pull published posts with embeds; 12 per page for good perf
    const url = `${API}/wp-json/wp/v2/posts?status=publish&_embed&per_page=12&page=${page}`;
    let list = [];
    try {
      const r = await fetch(url, { mode: "cors", credentials: "omit" });
      if (!r.ok) {
        if (r.status === 400 || r.status === 404) {
          exhausted = true;
          return;
        }
        throw new Error(`HTTP ${r.status}`);
      }
      list = await r.json();
    } catch (e) {
      console.error("[Home] fetch failed:", e);
      // Don’t hard stop — allow manual refresh or next intersection
      loading = false;
      return;
    }

    if (!Array.isArray(list) || list.length === 0) {
      exhausted = true;
      loading = false;
      return;
    }

    // Filter out cartoons reliably
    const filtered = list.filter(p => !isCartoon(p._embedded));

    grid.insertAdjacentHTML(
      "beforeend",
      filtered.map(postCardHTML).join("")
    );

    page += 1;
    loading = false;
  }

  // Initial batch
  await loadPage();

  // Robust infinite scroll (guard against rapid triggers)
  const io = new IntersectionObserver(
    entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          loadPage();
        }
      }
    },
    { rootMargin: "900px 0px 900px 0px", threshold: 0 }
  );
  io.observe(sentinel);
}
