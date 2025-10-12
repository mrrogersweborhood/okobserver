// Home view — filters out "Cartoon" category and shows date in meta line

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

// Cache the cartoon category id so we fetch it only once
let CARTOON_CAT_ID = null;

async function getCartoonCategoryId() {
  if (CARTOON_CAT_ID !== null) return CARTOON_CAT_ID;

  // Look up categories that resemble "cartoon"
  // Try both slug & name to be safe.
  const url = `${API_BASE}/categories?per_page=100&search=cartoon&_fields=id,slug,name`;
  try {
    const { json: cats } = await apiFetchJson(url);
    const hit = Array.isArray(cats)
      ? cats.find(
          (c) => /cartoon/i.test(c?.slug || "") || /cartoon/i.test(c?.name || "")
        )
      : null;
    CARTOON_CAT_ID = hit ? hit.id : 0;
  } catch (_) {
    CARTOON_CAT_ID = 0; // fail open (no filtering) if lookup fails
  }
  return CARTOON_CAT_ID;
}

/* ---------- data ---------- */

async function fetchPosts(page = 1) {
  const cartoonId = await getCartoonCategoryId();
  const exclude = cartoonId ? `&categories_exclude=${encodeURIComponent(cartoonId)}` : "";

  const url =
    `${API_BASE}/posts?status=publish&per_page=9&page=${page}` +
    `&_embed=1&orderby=date&order=desc${exclude}`;

  return apiFetchJson(url);
}

/* ---------- view ---------- */

export default async function renderHome(container) {
  const host = container || document.getElementById("app");
  host.innerHTML = `<h1>Latest Posts</h1><div class="grid"></div>`;
  const grid = host.querySelector(".grid");

  try {
    const { json: posts } = await fetchPosts(1);

    posts.forEach((p) => {
      const title = stripHtml(p?.title?.rendered);
      const excerpt = stripHtml(p?.excerpt?.rendered);
      const link = `#/post/${p.id}`;
      const img = p?._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";
      const author = p?._embedded?.author?.[0]?.name || "Oklahoma Observer";
      const dateStr = new Date(p.date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      grid.innerHTML += `
        <article class="card">
          <a href="${link}" class="thumb-wrap">
            ${img ? `<img class="thumb" src="${img}" alt="">` : ""}
          </a>
          <div class="card-body">
            <h2 class="title"><a href="${link}">${title}</a></h2>
            <div class="meta">By ${author} • ${dateStr}</div>
            <div class="excerpt">${excerpt}</div>
          </div>
        </article>`;
    });
  } catch (err) {
    grid.innerHTML = `<p>Failed to fetch posts: ${err}</p>`;
  }
}
