// Home view with thumbnails + basic load
const API_BASE = window.OKO_API_BASE;
function stripHtml(html){const d=document.createElement("div"); d.innerHTML=html||""; return d.textContent||"";}
async function apiFetchJson(url){const res=await fetch(url); if(!res.ok) throw new Error(`API Error ${res.status}`); const json=await res.json(); return {json, headers: res.headers};}
async function fetchPosts(page=1){const url=`${API_BASE}/posts?status=publish&per_page=9&page=${page}&_embed=1&orderby=date&order=desc`; return apiFetchJson(url);}
export default async function renderHome(container){
  const host=container||document.getElementById("app");
  host.innerHTML=`<h1>Latest Posts</h1><div class="grid"></div>`;
  const grid=host.querySelector(".grid");
  try{
    const {json:posts}=await fetchPosts(1);
    posts.forEach(p=>{
      const title=stripHtml(p?.title?.rendered);
      const excerpt=stripHtml(p?.excerpt?.rendered);
      const link=`#/post/${p.id}`;
      const img=(p?._embedded?.["wp:featuredmedia"]?.[0]?.source_url)||"";
      grid.innerHTML += `<article class="card">
        <a href="${link}" class="thumb-wrap">${img?`<img class="thumb" src="${img}" alt="">`:""}</a>
        <div class="card-body">
          <h2 class="title"><a href="${link}">${title}</a></h2>
          <div class="meta">By ${p?._embedded?.author?.[0]?.name||"Oklahoma Observer"}</div>
          <div class="excerpt">${excerpt}</div>
        </div>
      </article>`;
    });
  }catch(err){
    grid.innerHTML = `<p>Failed to fetch posts: ${err}</p>`;
  }
}
