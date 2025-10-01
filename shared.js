// shared.js — common UI helpers + grid/card renderers

export function decodeEntities(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}
export function stripTags(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}

function pickFeaturedSrc(post) {
  try {
    const m = post?._embedded?.["wp:featuredmedia"]?.[0];
    if (!m) return "";
    const sizes = m.media_details?.sizes || {};
    const order = ["large", "medium_large", "medium", "thumbnail", "1536x1536", "2048x2048"];
    const best = order.map(k => sizes[k]).find(s => s?.source_url) || null;
    return (best?.source_url || m.source_url || "").trim();
  } catch { return ""; }
}

export function renderCard(post) {
  const id = post?.id;
  const href = id ? `#/post/${id}` : "#/";
  const title = decodeEntities(post?.title?.rendered || "Untitled");
  const author = post?._embedded?.author?.[0]?.name || "";
  const date = new Date(post?.date || Date.now());
  const dateStr = date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const thumb = pickFeaturedSrc(post);
  const excerpt = stripTags(post?.excerpt?.rendered || "");

  const card = document.createElement("article");
  card.className = "card";

  if (thumb) {
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = thumb;
    img.alt = "";
    img.decoding = "async";
    img.loading = "lazy";
    img.addEventListener("click", () => { location.hash = href; });
    card.appendChild(img);
  }

  const body = document.createElement("div");
  body.className = "card-body";

  const h3 = document.createElement("h3");
  h3.className = "title";
  const a = document.createElement("a");
  a.className = "title-link";
  a.href = href;
  a.textContent = title;
  h3.appendChild(a);

  const meta = document.createElement("div");
  meta.className = "meta-author-date";
  const authorSpan = document.createElement("span");
  authorSpan.textContent = author || "";
  const dateSpan = document.createElement("span");
  dateSpan.className = "date";
  dateSpan.textContent = dateStr;
  meta.appendChild(authorSpan);
  meta.appendChild(dateSpan);

  const p = document.createElement("p");
  p.className = "excerpt";
  p.textContent = excerpt;

  body.appendChild(h3);
  body.appendChild(meta);
  body.appendChild(p);
  card.appendChild(body);

  return card;
}

export function renderGridFromPosts(posts, container) {
  if (!Array.isArray(posts) || !container) return;
  while (container.firstChild) container.removeChild(container.firstChild);
  for (const post of posts) container.appendChild(renderCard(post));
}

export function appendCards(posts, container) {
  if (!Array.isArray(posts) || !container) return;
  for (const post of posts) container.appendChild(renderCard(post));
}
