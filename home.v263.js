// Home view — blue titles, date, excludes 'Cartoon', robust infinite scroll
const API_BASE = window.OKO_API_BASE;

// Small utility
function stripHtml(html){
  const d=document.createElement("div"); d.innerHTML=html||"";
  return d.textContent||"";
}

// Fetch that retries with alternate base if a 404 is returned.
// This handles Worker route differences (/wp-json/wp/v2 vs /wp/v2).
async function apiFetchJson(url){
  const r = await fetch(url);
  if (r.ok) return { json: await r.json(), headers: r.headers };

  if (r.status === 404) {
    // Try alternate base
    const altBase = API_BASE.includes("/wp-json/wp/v2")
      ? API_BASE.replace("/wp-json/wp/v2", "/wp/v2")
      : API_BASE.replace("/wp/v2", "/wp-json/wp/v2");

    const altUrl = url.replace(API_BASE.replace(/\/$/,""), altBase.replace(/\/$/,""));
    const r2 = await fetch(altUrl);
    if (r2.ok) return { json: await r2.json(), headers: r2.headers };
  }
  throw new Error("API Error " + r.status);
}

let CARTOON_CAT_ID = null;

async function getCartoonCategoryId(){
  if (CARTOON_CAT_ID !== null) return CARTOON_CAT_ID;

  const url = API_BASE.replace(/\/$/,'') +
    "/categories?per_page=100&search=cartoon&_fields=id,slug,name";

  try{
    const { json: cats } = await apiFetchJson(url);
    const hit = Array.isArray(cats)
      ? cats.find(c => /cartoon/i.test(c?.slug||"") || /cartoon/i.test(c?.name||""))
      : null;
    CARTOON_CAT_ID = hit ? hit.id : 0;
  }catch{
    CARTOON_CAT_ID = 0;
  }
  return CARTOON_CAT_ID;
}

async function fetchPosts(page=1, perPage=9){
  const cartoonId = await getCartoonCategoryId();
  const exclude = cartoonId ? ("&categories_exclude=" + encodeURIComponent(cartoonId)) : "";
  const base = API_BASE.replace(/\/$/,'') + "/posts";
  const url  = base + "?status=publish&per_page=" + perPage +
               "&page=" + page + "&_embed=1&orderby=date&order=desc" + exclude;
  return apiFetchJson(url);
}

function renderCard(p){
  const title   = stripHtml(p?.title?.rendered);
  const excerpt = stripHtml(p?.excerpt?.rendered);
  const link    = "#/post/" + p.id;
  const img     = p?._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";
  const author  = p?._embedded?.author?.[0]?.name || "Oklahoma Observer";
  const dateStr = new Date(p.date).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});

  const el = document.createElement("article");
  el.className = "card";
  el.innerHTML =
    '<a href="'+link+'" class="thumb-wrap">' +
      (img ? ('<img class="thumb" src="'+img+'" alt="">') : "") +
    '</a>' +
    '<div class="card-body">' +
      '<h2 class="title"><a href="'+link+'">'+title+'</a></h2>' +
      '<div class="meta">By '+author+' • '+dateStr+'</div>' +
      '<div class="excerpt">'+excerpt+'</div>' +
    '</div>';
  return el;
}

export default async function renderHome(container){
  const host = container || document.getElementById("app");
  if (!host){ console.error("[Home] #app container missing"); return; }

  host.innerHTML = '<h1>Latest Posts</h1><div class="grid"></div><div id="scroll-sentinel" style="height:1px;"></div>';

  const grid = host.querySelector(".grid");
  const sentinel = host.querySelector("#scroll-sentinel");
  let page = 1, totalPages = Infinity, loading = false;

  async function loadPage(n){
    if (loading || n > totalPages) return;
    loading = true;
    try{
      const { json, headers } = await fetchPosts(n, 9);
      const tp = parseInt(headers.get("X-WP-TotalPages") || "0", 10);
      if (tp) totalPages = tp;
      if (Array.isArray(json)){
        const frag = document.createDocumentFragment();
        json.forEach(p => frag.appendChild(renderCard(p)));
        grid.appendChild(frag);
      }
    }catch(err){
      console.error("[Home] load failed", err);
      const div = document.createElement("div");
      div.className = "card-body";
      div.textContent = 'Failed to fetch posts: ' + (err.message || err);
      grid.appendChild(div);
    }finally{
      loading = false;
    }
  }

  await loadPage(page);

  const cs = getComputedStyle(host);
  const ioRoot = (cs.overflowY === "auto" || cs.overflowY === "scroll") ? host : null;

  let io = null;
  if ("IntersectionObserver" in window){
    io = new IntersectionObserver(async entries => {
      const e = entries[0];
      if (!e || !e.isIntersecting || loading) return;
      if (page >= totalPages){ io && io.disconnect(); return; }
      page += 1; await loadPage(page);
    }, { root: ioRoot, rootMargin: "800px 0px 800px 0px", threshold: 0 });
    io.observe(sentinel);
  }

  let ticking = false;
  (ioRoot || window).addEventListener("scroll", () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(async () => {
      const c  = ioRoot || document.documentElement;
      const top = (ioRoot ? c.scrollTop : window.scrollY) || 0;
      const h   = (ioRoot ? c.clientHeight : window.innerHeight);
      const sh  = (ioRoot ? c.scrollHeight : document.documentElement.scrollHeight);
      if (!loading && page < totalPages && top + h + 1000 >= sh){
        page += 1; await loadPage(page);
      }
      ticking = false;
    });
  }, { passive: true });
}
