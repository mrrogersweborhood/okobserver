// home.js — summary grid
// v=2.3.4

import {
  PER_PAGE,
  fetchLeanPostsPage,
  getFeaturedImage,
  getAuthorName,
} from "./api.js";
import { createEl, decodeEntities, ordinalDate, selectHeroSrc } from "./shared.js";

const app = () => document.getElementById("app");
const SEEN = new Set(); // avoid accidental duplicates between pages

function cardForPost(post){
  const fid = String(post.id);
  const title = decodeEntities(post?.title?.rendered || "");
  const author = getAuthorName(post);
  const date = ordinalDate(post.date);
  const img = selectHeroSrc(getFeaturedImage(post), "icon.png");

  const imgEl = createEl("img", {
    class:"thumb",
    src: img,
    alt: title || "featured image",
  });
  imgEl.addEventListener("error", ()=>{ imgEl.src = "icon.png"; imgEl.style.objectFit="contain"; });

  const titleEl = createEl("h2",{class:"title"},[
    createEl("a",{href:`#/post/${fid}`, title: title}, [title||"Untitled"])
  ]);

  const meta = createEl("div",{class:"meta"}, [`${author} — ${date}`]);
  const excerpt = createEl("div",{class:"excerpt", html: decodeEntities(post?.excerpt?.rendered || "")});

  const card = createEl("article",{class:"card"},[
    createEl("a",{href:`#/post/${fid}`},[imgEl]),
    createEl("div",{class:"card-body"},[titleEl, meta, excerpt])
  ]);

  return card;
}

export async function renderHome(){
  const host = app();
  if (!host) return;

  const wrap = createEl("div");
  const grid = createEl("div",{class:"grid"});
  wrap.append(grid);
  host.innerHTML = "";
  host.append(wrap);

  // Page 1
  const controller = new AbortController();
  let page = 1;

  async function loadMore(){
    const posts = await fetchLeanPostsPage(page, { signal: controller.signal });
    for (const p of posts){
      if (SEEN.has(p.id)) continue;
      SEEN.add(p.id);
      grid.append(cardForPost(p));
    }
    page += 1;
  }

  await loadMore();

  // simple infinite scroll (bottom sentinel)
  const sentinel = createEl("div",{style:"height:1px"});
  host.append(sentinel);
  const io = new IntersectionObserver(async (ents)=>{
    for (const e of ents){
      if (e.isIntersecting){
        try{ await loadMore(); }catch{}
      }
    }
  },{rootMargin:"800px 0px"});
  io.observe(sentinel);
}
