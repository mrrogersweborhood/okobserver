const API_BASE = window.OKO_API_BASE;
async function fetchPost(id){const res=await fetch(`${API_BASE}/posts/${id}?_embed=1`); if(!res.ok) throw new Error("Post not found"); return res.json();}
export default async function renderPost(container,id){
  const host=container||document.getElementById("app");
  host.innerHTML=`<p>Loading post...</p>`;
  try{
    const post=await fetchPost(id);
    const title=post?.title?.rendered||"Untitled";
    const author=post?._embedded?.author?.[0]?.name||"Oklahoma Observer";
    const date=new Date(post.date).toLocaleDateString();
    const img=post?._embedded?.["wp:featuredmedia"]?.[0]?.source_url||"";
    host.innerHTML=`<article class="post">
      <a href="#/" class="btn">← Back</a>
      <h1>${title}</h1>
      <div class="meta">${author} — ${date}</div>
      ${img?`<img src="${img}" class="hero" alt="">`:""}
      <div class="content">${post?.content?.rendered||"<p>No content.</p>"}</div>
    </article>`;
  }catch(err){ host.innerHTML=`<p>Failed to load post: ${err}</p>`; }
}
