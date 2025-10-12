// detail.v263.js — poster + clean content (no autoplay) and no big gap above text
const API_BASE = window.OKO_API_BASE;

/* helpers */
function stripHtml(html){const d=document.createElement("div");d.innerHTML=html||"";return d.textContent||"";}
function pickPoster(post){const featured=post?._embedded?.["wp:featuredmedia"]?.[0]?.source_url||"";const og=post?.yoast_head_json?.og_image?.[0]?.url||"";return featured||og||"";}
function extractVideoUrlFromContent(html){if(!html)return"";const div=document.createElement("div");div.innerHTML=html;const ifr=div.querySelector("iframe[src]");if(ifr&&/youtube\.com|youtu\.be|vimeo\.com/i.test(ifr.src))return ifr.src;const a=Array.from(div.querySelectorAll("a[href]")).find(el=>/youtube\.com|youtu\.be|vimeo\.com/i.test(el.href));return a?a.href:"";}
function normalizeVideoUrlForEmbed(url){if(!url)return"";const ytWatch=url.match(/youtube\.com\/watch\?v=([^&]+)/i);if(ytWatch)return`https://www.youtube.com/embed/${ytWatch[1]}`;const ytShort=url.match(/youtu\.be\/([^?&]+)/i);if(ytShort)return`https://www.youtube.com/embed/${ytShort[1]}`;if(/youtube\.com\/embed\//i.test(url))return url;const vimeo=url.match(/vimeo\.com\/(\d+)/i);if(vimeo)return`https://player.vimeo.com/video/${vimeo[1]}`;if(/player\.vimeo\.com\/video\//i.test(url))return url;return url;}
function sanitizeContent(html){if(!html)return"";let out=html.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi,"").replace(/<div>(?:\s|&nbsp;|<br\s*\/?>)*<\/div>/gi,"").replace(/<figure[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/figure>/gi,"");out=out.replace(/(?:<br\s*\/?>\s*){2,}/gi,"<br>");const tmp=document.createElement("div");tmp.innerHTML=out;while(tmp.firstChild&&tmp.firstChild.nodeType===3&&!tmp.firstChild.nodeValue.trim()){tmp.removeChild(tmp.firstChild);}const firstEl=tmp.querySelector("p,h1,h2,h3,h4,h5,h6,figure,div,ul,ol,blockquote");if(firstEl){const style=(firstEl.getAttribute("style")||"").replace(/margin-top\s*:\s*[^;]+;?/i,"");firstEl.setAttribute("style",style+"; margin-top: 0 !important;");}return tmp.innerHTML.trim();}
async function fetchPost(id){const res=await fetch(`${API_BASE}/posts/${id}?_embed=1`);if(!res.ok)throw new Error(`Post not found (${res.status})`);return res.json();}

/* view */
export default async function renderPost(container,id){
  const host=container||document.getElementById("app");
  host.innerHTML=`<p>Loading post…</p>`;
  try{
    const post=await fetchPost(id);
    const titleHtml=post?.title?.rendered||"Untitled";
    const contentHtml=sanitizeContent(post?.content?.rendered||"<p>No content.</p>");
    const author=stripHtml(post?._embedded?.author?.[0]?.name||post?.yoast_head_json?.author||"Oklahoma Observer");
    const dateStr=post?.date?new Date(post.date).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"}):"";
    const posterUrl=pickPoster(post);
    const videoUrlRaw=extractVideoUrlFromContent(post?.content?.rendered)||post?.yoast_head_json?.og_video?.url||post?.yoast_head_json?.og_video||"";
    const videoEmbedUrl=normalizeVideoUrlForEmbed(typeof videoUrlRaw==="string"?videoUrlRaw:(videoUrlRaw||""));

    host.innerHTML = `
      <article class="post" style="margin-bottom:0;">
        <p><a href="#/" class="btn">← Back</a></p>
        <h1 class="post-title" style="margin-bottom:.5rem;">${titleHtml}</h1>
        <div class="post-meta-line" style="display:block; color:#555; margin:.25rem 0 1rem; font-size:.95rem;">
          ${author ? \`By <span class="post-author">\${author}</span>\` : ""}
          ${author && dateStr ? " — " : ""}
          ${dateStr ? \`<time datetime="${post?.date}">\${dateStr}</time>\` : ""}
        </div>
        ${
          posterUrl && videoEmbedUrl
            ? `
          <a href="#" id="videoPosterLink" aria-label="Play video">
            <div class="video-poster" style="position:relative; display:block;">
              <img src="${posterUrl}" alt="" style="width:100%; height:auto; display:block;">
              <div class="play-overlay" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:linear-gradient(to bottom, rgba(0,0,0,.05), rgba(0,0,0,.35));">
                <div style="width:76px; height:76px; border-radius:50%; background:rgba(30,144,255,.95); display:flex; align-items:center; justify-content:center; box-shadow:0 10px 30px rgba(0,0,0,.25);">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>
                </div>
              </div>
            </div>
          </a>`
            : posterUrl
            ? `<img src="${posterUrl}" class="hero" alt="" style="max-width:100%;height:auto;display:block;margin:0 auto 1rem;">`
            : ""
        }
        <div class="content content-sanitized">${contentHtml}</div>
      </article>
      <div id="videoModal" style="position:fixed; inset:0; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,.75); z-index:9999;">
        <div style="position:relative; width:min(960px, 92vw); aspect-ratio:16/9; background:#000; border-radius:10px; overflow:hidden;">
          <button id="videoClose" aria-label="Close video" style="position:absolute; top:8px; right:8px; z-index:2; background:rgba(0,0,0,.6); color:#fff; border:none; border-radius:6px; padding:6px 10px; cursor:pointer;">✕</button>
          <iframe id="videoFrame" src="" title="Video player" allow="fullscreen" allowfullscreen style="position:absolute; inset:0; width:100%; height:100%; border:0;"></iframe>
        </div>
      </div>
    `;

    if (videoEmbedUrl) {
      const posterLink=document.getElementById("videoPosterLink");
      const modal=document.getElementById("videoModal");
      const frame=document.getElementById("videoFrame");
      const closeBtn=document.getElementById("videoClose");

      function openModal(e){ if(e) e.preventDefault(); frame.src = videoEmbedUrl; modal.style.display="flex"; document.body.style.overflow="hidden"; }
      function closeModal(){ modal.style.display="none"; frame.src=""; document.body.style.overflow=""; }

      posterLink?.addEventListener("click", openModal);
      closeBtn?.addEventListener("click", closeModal);
      modal?.addEventListener("click", (e)=>{ if(e.target===modal) closeModal(); });
      document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") closeModal(); });
    }
  }catch(err){
    console.error("[Detail] load failed", err);
    host.innerHTML = `<p style="color:#b00020">Failed to load post: ${err && err.message ? err.message : err}</p>`;
  }
}
