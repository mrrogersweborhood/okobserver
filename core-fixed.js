/* core-fixed.js – router views + shared fetch */
import { CONFIG } from "./main.js";

/* Simple fetch helper with status checks */
async function apiFetchJson(url) {
  const r = await fetch(url, { credentials: "omit" });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
  return r.json();
}

/* Compose card for a post summary */
function postCard(post) {
  const card = document.createElement("article");
  card.className = "post card";

  // featured image
  const img = document.createElement("img");
  img.className = "thumb";
  img.loading = "lazy";
  img.alt = post.title?.rendered?.replace(/<[^>]+>/g, "") || "Post image";
  img.src =
    post._embedded?.["wp:featuredmedia"]?.[0]?.media_details?.sizes?.medium_large?.source_url ||
    post._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
    "";

  const body = document.createElement("div");
  body.className = "post-body";

  const a = document.createElement("a");
  a.href = `#/post/${post.id}`;
  a.className = "title";
  a.innerHTML = post.title?.rendered || "Untitled";

  const meta = document.createElement("div");
  meta.className = "meta";
  const author =
    post._embedded?.author?.[0]?.name || post._embedded?.author?.[0]?.slug || "Oklahoma Observer";
  const date = new Date(post.date).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  meta.textContent = `By ${author} — ${date}`;

  const excerpt = document.createElement("div");
  excerpt.className = "excerpt";
  excerpt.innerHTML = post.excerpt?.rendered || "";

  // make the image clickable too
  img.style.cursor = "pointer";
  img.addEventListener("click", () => (location.hash = `#/post/${post.id}`));

  body.append(a, meta, excerpt);
  card.append(img, body);
  return card;
}

/* HOME */
export async function renderHome() {
  const wrap = document.createElement("div");
  wrap.style.padding = "12px 12px 18px";

  const title = document.createElement("h2");
  title.textContent = "Latest Posts";
  title.style.margin = "6px 4px 12px";
  wrap.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "grid";

  wrap.appendChild(grid);

  try {
    const url =
      `${CONFIG.API_BASE}/posts?status=publish&_embed=1&per_page=18`;
    const posts = await apiFetchJson(url);
    posts.forEach((p) => grid.appendChild(postCard(p)));
  } catch (err) {
    console.error(err);
    const fail = document.createElement("div");
    fail.style.padding = "12px";
    fail.textContent = "Failed to fetch posts.";
    wrap.appendChild(fail);
  }

  return wrap;
}

/* ABOUT (simple) */
export async function renderAbout() {
  const div = document.createElement("div");
  div.className = "card";
  div.style.padding = "18px";
  div.innerHTML = `<h2>About</h2><p>Independent coverage from The Oklahoma Observer.</p>`;
  return div;
}

/* DETAIL – delegates to detail.v263.js for layout rules */
export async function renderDetail(id) {
  const mod = await import("./detail.v263.js");
  return mod.renderPostDetail(id, { apiFetchJson, CONFIG });
}
