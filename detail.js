// detail.js — post detail view (clickable hero + no placeholder logo)
// v=2.3.8

import {
  fetchPostById,
  getFeaturedImage,
  resolveFeaturedImage,
  getAuthorName
} from "./api.js";
import {
  createEl,
  decodeEntities,
  ordinalDate,
  selectHeroSrc,
  normalizeFirstParagraph
} from "./shared.js";

const app = () => document.getElementById("app");

function detectExternalVideoUrl(html){
  const a = document.createElement("div");
  a.innerHTML = html || "";
  const links = Array.from(a.querySelectorAll("a[href]")).map(e=>e.getAttribute("href"));
  for (const href of links){
    if (!href) continue;
    if (/facebook\.com\/.*\/videos\//i.test(href)) return href;
    if (/vimeo\.com\/\d+/i.test(href)) return href;
    if (/youtube\.com\/watch\?v=|youtu\.be\//i.test(href)) return href;
  }
  return null;
}

export async function renderPost(id){
  const host = app();
  if (!host) return;
  host.innerHTML = "Loading…";

  const post = await fetchPostById(id);
  const title = decodeEntities(post?.title?.rendered || "");
  const author = getAuthorName(post);
  const date = ordinalDate(post?.date);
  const contentHTML = String(post?.content?.rendered || "");

  const extVideo = detectExternalVideoUrl(contentHTML);

  const h1 = createEl("h1",{},[title || "Untitled"]);
  const meta = createEl("div",{class:"meta"}, [`${author} — ${date}`]);

  const hero = createEl("img",{class:"hero", alt: title || "featured image"});
  hero.style.visibility = "hidden";
  hero.setAttribute("aria-hidden","true");

  const reveal = (src)=>{
    if (!src){ hero.remove(); return; }
    hero.src = src;
    hero.onload = ()=>{ hero.style.visibility="visible"; hero.removeAttribute("aria-hidden"); };
    hero.onerror = ()=>{ hero.remove(); };
  };

  const embedded = getFeaturedImage(post);
  if (embedded) reveal(embedded); else resolveFeaturedImage(post).then(reveal).catch(()=>hero.remove());

  if (extVideo){
    hero.classList.add("hero--clickable");
    hero.title = "Open video in a new tab";
    hero.addEventListener("click", ()=>{ window.open(extVideo, "_blank","noopener"); });
  }

  const content = createEl("div",{class:"content", html: contentHTML});
  normalizeFirstParagraph(content);

  const backBottom = createEl("a",{class:"btn", href:"#/"},["Back to posts"]);

  const parts = [h1, meta, hero, content, createEl("div",{style:"margin-top:14px"},[backBottom])];

  const article = createEl("article",{class:"post"}, parts);
  host.innerHTML = "";
  host.append(article);
}
