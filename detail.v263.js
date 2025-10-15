/* OkObserver · detail.v263.js · v2.7.1
   Fixes: title blue box removed, author/date visible under title
   Safe standalone update — no layout, routing, or proxy changes.
*/

const API_BASE = (window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2').replace(/\/+$/, '');

function joinUrl(base, path){const b=(base||'').replace(/\/+$/,'');const p=(path||'').replace(/^\/+/,'');return `${b}/${p}`;}
function qs(params={}){const u=new URLSearchParams();for(const [k,v] of Object.entries(params)){if(v==null||v==='')continue;Array.isArray(v)?v.forEach(x=>u.append(k,x)):u.append(k,v)}const s=u.toString();return s?`?${s}`:'';}
async function apiJSON(pathOrUrl, params){const url=pathOrUrl.startsWith('http')?pathOrUrl+qs(params):joinUrl(API_BASE,pathOrUrl)+qs(params);const r=await fetch(url,{headers:{accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
const prettyDate = iso => {try{return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})}catch{return iso||''}};
const decode = html => {const d=document.createElement('div');d.innerHTML=html;return d.textContent||d.innerText||''};

function featuredSrc(post){
  const fm = post?._embedded?.['wp:featuredmedia']?.[0];
  return fm?.media_details?.sizes?.large?.source_url
      || fm?.media_details?.sizes?.medium_large?.source_url
      || fm?.source_url || '';
}

export default async function renderDetail(app,idParam){
  const mount = app || document.getElementById('app');
  const id = Array.isArray(idParam)?idParam[0]:idParam;

  if(!API_BASE){mount.innerHTML='<p>Page error: API base missing.</p>';return;}
  if(!id){mount.innerHTML='<p>Page error: missing id.</p>';return;}

  mount.innerHTML = `
    <article class="post-detail">
      <div class="back-wrap"><button id="backBtn">← Back to Posts</button></div>
      <figure class="post-media"></figure>
      <h1 class="post-title"></h1>
      <p class="post-meta"></p>
      <div class="post-content">Loading…</div>
      <div class="back-wrap"><button id="backBtnBottom">← Back to Posts</button></div>
    </article>
  `;

  mount.querySelectorAll('#backBtn,#backBtnBottom').forEach(btn=>{
    btn.addEventListener('click',()=>window.location.hash='#/');
  });

  let post;
  try {
    post = await apiJSON(`posts/${encodeURIComponent(id)}`,{_embed:1});
  } catch(err) {
    console.error('[Detail] fetch failed', err);
    mount.querySelector('.post-content').innerHTML='<p style="color:red">Failed to load post.</p>';
    return;
  }

  const title = decode(post.title?.rendered||'(Untitled)');
  const author = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date = prettyDate(post.date || post.date_gmt);
  const content = post.content?.rendered || '';
  const featured = featuredSrc(post);

  mount.querySelector('.post-title').textContent = title;
  mount.querySelector('.post-meta').textContent = `By ${author} — ${date}`;
  if(featured){
    mount.querySelector('.post-media').innerHTML = `<img src="${featured}" alt="${title}" style="width:100%;height:auto;border-radius:12px;margin:10px 0;">`;
  }

  mount.querySelector('.post-content').innerHTML = content;

  // Styling fix for blue box and spacing
  const styleId = 'oko-detail-style-fix';
  if(!document.getElementById(styleId)){
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .post-detail{max-width:900px;margin:0 auto;padding:16px;background:none;border:none;box-shadow:none;}
      .post-title{font-size:1.8rem;font-weight:700;margin:.8rem 0 .4rem;color:#111;background:none!important;border:none!important;padding:0!important;}
      .post-meta{font-size:.9rem;color:#666;margin-bottom:1rem;}
      .post-content{line-height:1.6;color:#222;}
      .post-content img{max-width:100%;height:auto;border-radius:10px;margin:1rem 0;}
      .back-wrap{margin:1rem 0;}
      button#backBtn,button#backBtnBottom{background:#1e63ff;color:#fff;border:0;padding:.5rem 1rem;border-radius:20px;cursor:pointer;}
      button#backBtn:hover,button#backBtnBottom:hover{filter:brightness(1.1);}
    `;
    document.head.appendChild(style);
  }
}
