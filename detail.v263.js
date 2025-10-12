// detail.v263.js — Post detail page (default export included)

function el(tag, opts = {}, children = []) {
  opts = opts || {};
  if (children == null) children = [];
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) if (v != null) node.setAttribute(k, v);
  if (!Array.isArray(children)) children = [children];
  for (const c of children) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}
function stripHtml(html) {
  if (!html) return "";
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent || d.innerText || "";
}
function normalizeUrl(u){
  try{ if(!u) return ""; u=String(u).trim(); if(u.startsWith("//")) return "https:"+u; return u.replace(/^http:\/\//,"https://"); }
  catch(_){ return u||""; }
}
function selectHero(post) {
  try {
    const media = post?._embedded?.["wp:featuredmedia"];
    if (media && media[0]) {
      const sizes = media[0]?.media_details?.sizes || {};
      const order = ["large", "medium_large", "medium", "post-thumbnail", "full"];
      for (const k of order) { const u = sizes[k]?.source_url; if (u) return normalizeUrl(u); }
      if (media[0].source_url) return normalizeUrl(media[0].source_url);
    }
  } catch(_){}
  return "";
}

const API_BASE = (window && (window.API_BASE || window.OKO_API_BASE)) || "api/wp/v2";
async function apiFetchJson(url) {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API Error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}
async function fetchPost(id) {
  const url = `${API_BASE}/posts/${encodeURIComponent(id)}?_embed=1`;
  return apiFetchJson(url);
}

export async function renderPost(container, id) {
  const host = container || document.getElementById("app");
  if (!host) { console.error("[OkObserver] post container not found"); return; }

  host.innerHTML = "";
  const back = el("a", { className: "btn", attrs: { href: "#/" } }, "← Back to posts");
  const header = el("div", { className: "post-header" });
  const heroWrap = el("div", { className: "hero-wrap" });
  const titleEl = el("h1");
  const metaEl = el("div", { className: "meta" });
  const bodyEl = el("div", { className: "post-body" });

  header.append(back, titleEl, metaEl);
  host.append(header, heroWrap, bodyEl);

  let post = null;
  try { post = await fetchPost(id); }
  catch (err) {
    titleEl.textContent = "Post not found";
    metaEl.textContent = `Sorry, we couldn't load this post (${id}).`;
    console.error("[OkObserver] Post load failed:", err);
    return;
  }

  titleEl.textContent = stripHtml(post?.title?.rendered) || "Untitled";
  const by = post?._embedded?.author?.[0]?.name || "Oklahoma Observer";
  const date = new Date(post.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  metaEl.textContent = `${by} — ${date}`;

  const heroUrl = selectHero(post);
  heroWrap.innerHTML = "";
  if (heroUrl) {
    const link = el("a", { attrs: { href: heroUrl, target: "_blank", rel: "noopener" } });
    const heroImg = el("img", { className: "hero", attrs: { src: heroUrl, alt: "" } });
    link.appendChild(heroImg);
    heroWrap.appendChild(link);
  }

  bodyEl.innerHTML = post?.content?.rendered || "<p>No content.</p>";
}

export default renderPost;
