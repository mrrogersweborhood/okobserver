import { app, showError, normalizeFirstParagraph, deLazyImages, transformEmbeds, hardenLinks } from "./common.js";
import { fetchAboutPage } from "./api.js";

const ABOUT_CACHE_KEY = "__about_html";
const ABOUT_CACHE_TS_KEY = "__about_ts";
const ABOUT_TTL_MS = 60 * 60 * 1000;

function renderAboutShell(){
  if (!app()) return;
  app().innerHTML = `
    <article class="page" id="aboutPage">
      <h1>About</h1>
      <div class="content" id="aboutContent"><p class="center">Loading…</p></div>
    </article>`;
}

function putAboutCache(html){
  try { sessionStorage.setItem(ABOUT_CACHE_KEY, html || ""); sessionStorage.setItem(ABOUT_CACHE_TS_KEY, String(Date.now())); }
  catch {}
}
function getAboutCache(){
  try {
    const ts = Number(sessionStorage.getItem(ABOUT_CACHE_TS_KEY) || 0);
    if (!ts) return null;
    if (Date.now() - ts > ABOUT_TTL_MS) return null;
    return sessionStorage.getItem(ABOUT_CACHE_KEY) || null;
  } catch { return null; }
}

export async function renderAbout(controllers){
  renderAboutShell();
  const host = document.getElementById("aboutContent");
  if (!host) return;

  const cached = getAboutCache();
  if (cached){
    host.innerHTML = cached;
    try { normalizeFirstParagraph(host); } catch {}
    try { hardenLinks(host); } catch {}
  }

  if (controllers.aboutAbort){ try{ controllers.aboutAbort.abort(); }catch{} }
  controllers.aboutAbort = new AbortController();

  try{
    const page = await fetchAboutPage(controllers.aboutAbort.signal);
    if (!page){
      if (!cached) host.innerHTML = `<p>Could not load About page content.</p>`;
      return;
    }

    const tmp = document.createElement("div");
    tmp.innerHTML = page?.content?.rendered || "";
    deLazyImages(tmp);
    transformEmbeds(tmp);

    tmp.querySelectorAll('p,div,section,article,blockquote,figure').forEach(el=>{
      const hasMedia = !!el.querySelector('img,iframe,video');
      if (!el.textContent.trim() && !hasMedia) el.remove();
    });
    tmp.querySelectorAll('br+br+br').forEach(br=>br.remove());
    tmp.querySelectorAll('img').forEach(img=>{
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.style.objectFit = "contain";
      img.style.display = "block";
      if (!img.style.margin) img.style.margin = "8px auto";
    });

    const cleaned = tmp.innerHTML;
    putAboutCache(cleaned);
    host.innerHTML = cleaned;

    try { normalizeFirstParagraph(host); } catch {}
    try { hardenLinks(host); } catch {}

  } catch(err){
    if (!cached){
      if (err?.name !== 'AbortError') showError(err);
      host.innerHTML = `<p>Unable to load About page at this time.</p>`;
    }
  }
}
