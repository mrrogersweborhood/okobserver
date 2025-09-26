import { app, state, stateForSave, saveHomeCache, showError,
         normalizeMediaUrl, normalizeFirstParagraph, deLazyImages,
         transformEmbeds, hardenLinks } from "./common.js";
import { fetchPost, authorMap } from "./api.js";

function renderPostShell(){
  try{ const ld=document.getElementById("infiniteLoader"); if(ld) ld.remove(); }catch{}
  if (!app()) return;
  app().innerHTML = `
    <article class="post" id="postView">
      <!-- Top back button intentionally removed -->
      <h1 id="pTitle"></h1>
      <div class="meta-author-date">
        <span class="author" id="pAuthor" style="font-weight:bold"></span>
        <span style="margin:0 6px">·</span>
        <span class="date" id="pDate" style="font-weight:normal;color:#000"></span>
      </div>
      <img id="pHero" class="hero" alt="" style="object-fit:contain;max-height:420px;display:none" />
      <div class="content" id="pContent"></div>
      <div style="display:flex;justify-content:space-between;gap:10px;margin-top:16px">
        <a class="btn" id="backBottom" href="#/" style="display:none">Back to posts</a>
      </div>
    </article>`;
  const goHome = (e)=>{
    e?.preventDefault?.();
    state.returningFromDetail = true;
    try{ sessionStorage.setItem("__okCache", JSON.stringify(stateForSave(state))); }catch{}
    location.hash = "#/";
  };
  document.getElementById("backBottom")?.addEventListener("click", goHome);
}

function featuredSrcFromPost(p){
  const m=p?._embedded?.["wp:featuredmedia"]?.[0];
  if(!m) return { src:"", width:null, height:null };
  const sizes=m.media_details?.sizes||{};
  const order=["2048x2048","1536x1536","large","medium_large","medium","thumbnail"];
  const best = order.map(k=>sizes[k]).find(s=>s?.source_url) || null;
  return { src:(best?.source_url || m.source_url || ""), width:(best?.width||null), height:(best?.height||null) };
}

export async function renderDetail(id, controllers){
  renderPostShell();
  if (controllers.detailAbort){ try{ controllers.detailAbort.abort(); }catch{} }
  controllers.detailAbort = new AbortController();
  try{
    const post = await fetchPost(id, controllers.detailAbort.signal);
    let { src, width, height } = featuredSrcFromPost(post);
    src = normalizeMediaUrl(src);

    const author =
      post?._embedded?.author?.[0]?.name ||
      authorMap.get(post.author) || "";
    const date = new Date(post.date).toLocaleDateString(undefined, {year:'numeric', month:'long', day:'numeric'});

    const pTitle = document.getElementById('pTitle');
    const pAuthor = document.getElementById('pAuthor');
    const pDate = document.getElementById('pDate');
    const pHero = document.getElementById('pHero');
    const pContent = document.getElementById('pContent');

    if (pTitle) pTitle.innerHTML = post?.title?.rendered || "Untitled";
    if (pAuthor) pAuthor.textContent = author || '';
    if (pDate) pDate.textContent = date || '';

    if (pHero && src) {
      pHero.src = src;
      if (width) pHero.width = width;
      if (height) pHero.height = height;
      pHero.style.display = '';
      pHero.alt = pTitle?.textContent || '';
      pHero.loading = 'lazy';
      pHero.decoding = 'async';
      pHero.fetchPriority = 'high';
      pHero.sizes = '100vw';
      pHero.onerror = function(){ this.style.display='none'; };
    }

    if (pContent) {
      const tmp = document.createElement('div');
      tmp.innerHTML = post?.content?.rendered || "";
      deLazyImages(tmp);
      transformEmbeds(tmp);
      pContent.innerHTML = tmp.innerHTML;
      try { normalizeFirstParagraph(pContent); } catch {}
      try { hardenLinks(pContent); } catch {}
    }

    const backBtn = document.getElementById('backBottom');
    if (backBtn) backBtn.style.display = '';

  } catch(err){
    if (err?.name !== 'AbortError') showError(err);
    const backBtn = document.getElementById('backBottom');
    if (backBtn) backBtn.style.display = '';
  }
}
