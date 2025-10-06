// home.js — summary grid with author + featured image + infinite scroll
// v=2.3.8 (no placeholder logo; defer image until real URL resolves)

import {
  PER_PAGE,
  fetchLeanPostsPage,
  getFeaturedImage,
  resolveFeaturedImage,
  getAuthorName,
} from "./api.js";
import { createEl, decodeEntities, ordinalDate } from "./shared.js";

const app = () => document.getElementById("app");
const SEEN = new Set();

function makeCardSkeleton(post){
  const pid   = String(post.id);
  const title = decodeEntities(post?.title?.rendered || "");
  const author= getAuthorName(post);
  const date  = ordinalDate(post?.date);

  const imgEl = createEl("img", {
    class: "thumb",
    alt: title || "featured image",
    loading: "lazy",
    decoding: "async"
  });
  imgEl.style.visibility = "hidden";
  imgEl.setAttribute("aria-hidden", "true");

  const embedded = getFeaturedImage(post);
  const show = (src) => {
    if (!src) { imgEl.remove(); return; }
    imgEl.src = src;
    imgEl.onload = () => {
      imgEl.style.visibility = "visible";
      imgEl.removeAttribute("aria-hidden");
    };
    imgEl.onerror = () => { imgEl.remove(); };
  };
  if (embedded) {
    show(embedded);
  } else {
    resolveFeaturedImage(post).then(show).catch(() => imgEl.remove());
  }

  const titleEl = createEl("h2",{class:"title"},[
    createEl("a",{href:`#/post/${pid}`, title: title}, [title || "Untitled"])
  ]);

  const meta = createEl("div",{class:"meta"}, [`${author} — ${date}`]);
  const excerpt = createEl("div",{
    class:"excerpt",
    html: decodeEntities(post?.excerpt?.rendered || "")
  });

  const imgWrap = createEl("a",{href:`#/post/${pid}`},[imgEl]);
  const cardChildren = [imgWrap, createEl("div",{class:"card-body"},[titleEl, meta, excerpt])];

  return createEl("article",{class:"card"}, cardChildren);
}

export async function renderHome(){
  const host = app();
  if (!host) return;

  const wrap = createEl("div");
  const grid = createEl("div",{class:"grid"});
  wrap.append(grid);
  host.innerHTML = "";
  host.append(wrap);

  let page = 1;
  const controller = new AbortController();

  async function loadPage(){
    const posts = await fetchLeanPostsPage(page, { signal: controller.signal, excludeCartoon: true });
    for (const p of posts){
      if (SEEN.has(p.id)) continue;
      SEEN.add(p.id);
      grid.append(makeCardSkeleton(p));
    }
    page += 1;
  }

  await loadPage();

  const sentinel = createEl("div",{style:"height:1px"});
  host.append(sentinel);
  const io = new IntersectionObserver(async (entries)=>{
    for (const e of entries){
      if (e.isIntersecting){
        try { await loadPage(); } catch {}
      }
    }
  },{rootMargin:"800px 0px"});
  io.observe(sentinel);
}
