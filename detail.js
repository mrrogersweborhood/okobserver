// detail.js — post detail with clickable hero (no duplicate players) + solid Back button
import {
  fetchPostById,
  getFeaturedImage,
  resolveFeaturedImage,
  getAuthorName,
  fetchAuthorsMap
} from './api.js';
import { createEl, decodeEntities, ordinalDate, normalizeFirstParagraph } from './shared.js';

const app = () => document.getElementById('app');

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

function contentHasIframe(html){
  const a = document.createElement('div'); a.innerHTML = html || '';
  return !!a.querySelector('iframe');
}

export async function renderPost(id){
  const host = app();
  if (!host) return;
  host.innerHTML = "Loading…";

  const post = await fetchPostById(id);

  // Author name (embedded or fallback fetch)
  let author = getAuthorName(post);
  if (!author || author === 'The Oklahoma Observer'){
    try{
      const map = await fetchAuthorsMap([post?.author].filter(Boolean));
      const alt = map[post?.author];
      if (alt) author = alt;
    }catch{}
  }

  const title = decodeEntities(post?.title?.rendered || "");
  const date = ordinalDate(post?.date);
  const contentHTML = String(post?.content?.rendered || "");

  const h1 = createEl("h1",{},[title || "Untitled"]);
  const meta = createEl("div",{class:"meta"}, [`${author} — ${date}`]);

  const content = createEl("div",{class:"content", html: contentHTML});
  normalizeFirstParagraph(content);

  const extVideo = detectExternalVideoUrl(contentHTML);
  const hasIframe = contentHasIframe(contentHTML);

  // Hero image only when not duplicating an existing iframe player
  let hero = null;
  if (!hasIframe) {
    const initial = getFeaturedImage(post);
    hero = createEl("img",{class:"hero", alt:title || "featured image"});
    hero.style.visibility = "hidden"; hero.setAttribute("aria-hidden","true");

    const reveal = (src)=>{
      if (!src){ hero.remove(); hero=null; return; }
      hero.src = src;
      hero.onload = ()=>{ hero.style.visibility="visible"; hero.removeAttribute("aria-hidden"); };
      hero.onerror = ()=>{ hero.remove(); hero=null; };
    };
    if (initial) reveal(initial); else resolveFeaturedImage(post).then(reveal).catch(()=>{ hero.remove(); hero=null; });

    if (extVideo){
      hero?.classList.add("hero--clickable");
      hero && hero.addEventListener("click", ()=>{ window.open(extVideo, "_blank","noopener"); });
      if (hero) hero.title = "Open video in a new tab";
    }
  }

  // Back to posts — delayed re-render for reliability
  const backBottom = createEl("a",{class:"btn", href:"#/", role:"button"},["Back to posts"]);
  backBottom.addEventListener("click", (e) => {
    e.preventDefault();
    // Force router reload after DOM settles
    setTimeout(() => {
      location.hash = "#/"; // triggers router(true) in main.js
      window.scrollTo({ top: 0 });
    }, 80);
  });

  const article = createEl("article",{class:"post"},[
    h1, meta, ...(hero?[hero]:[]), content, createEl("div",{style:"margin-top:14px"},[backBottom])
  ]);

  host.innerHTML = "";
  host.append(article);
}
