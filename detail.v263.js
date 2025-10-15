/* OkObserver · detail.v263.js · v2.6.6 (media-first + FB video + spacing + cleaners) */

const API_BASE = (window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2').replace(/\/+$/, '');

/* ---------- tiny utils ---------- */
function joinUrl(base, path){const b=(base||'').replace(/\/+$/,'');const p=(path||'').replace(/^\/+/,'');return `${b}/${p}`;}
function qs(params={}){const u=new URLSearchParams();for(const [k,v] of Object.entries(params)){if(v==null||v==='')continue;Array.isArray(v)?v.forEach(x=>u.append(k,x)):u.append(k,v)}const s=u.toString();return s?`?${s}`:'';}
async function apiJSON(pathOrUrl, params){
  const url = pathOrUrl.startsWith('http') ? pathOrUrl + qs(params) : joinUrl(API_BASE, pathOrUrl) + qs(params);
  const r = await fetch(url,{headers:{accept:'application/json'}}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json();
}
const prettyDate = iso => { try { return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}) } catch { return iso||'' } };
const decode = (html='') => { const d=document.createElement('div'); d.innerHTML=html; return d.textContent||d.innerText||'' };

/* ---------- featured media ---------- */
function featuredSrc(post){
  const fm = post?._embedded?.['wp:featuredmedia']?.[0];
  return fm?.media_details?.sizes?.large?.source_url
      || fm?.media_details?.sizes?.medium_large?.source_url
      || fm?.source_url || '';
}

/* ---------- video detection (Vimeo/YouTube/Facebook) ---------- */
function extractVideoURL(html=''){
  const unwrap = html.replace(/&amp;/g,'&');
  const d = document.createElement('div'); d.innerHTML = unwrap;

  // anchors
  for(const a of d.querySelectorAll('a[href]')){
    const href=(a.getAttribute('href')||'').replace(/&amp;/g,'&');
    if(/vimeo\.com\/\d+/.test(href)) return href;
    if(/(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/.test(href)) return href;
    if(/facebook\.com\/.+\/videos\/\d+/.test(href)) return href;
  }
  // iframes
  const f = d.querySelector('iframe[src*="vimeo.com"],iframe[src*="youtube.com"],iframe[src*="youtu.be"],iframe[src*="facebook.com"]');
  if(f) return (f.getAttribute('src')||'').replace(/&amp;/g,'&');

  // raw strings
  const text = d.textContent||'';
  const vm = text.match(/https?:\/\/(?:www\.)?vimeo\.com\/\d+/);
  if(vm) return vm[0];
  const yt = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if(yt) return yt[0];
  const fb = text.match(/https?:\/\/(?:www\.)?facebook\.com\/[^ \n]+\/videos\/\d+/);
  if(fb) return fb[0];

  return null;
}

function normalizePlayerSrc(url){
  if(!url) return null;
  const u = url.replace(/&amp;/g,'&');

  // Vimeo
  const vimeo = u.match(/vimeo\.com\/(\d+)/);
  if(vimeo) return { type:'vimeo', src:`https://player.vimeo.com/video/${vimeo[1]}` };

  // YouTube
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if(yt) return { type:'youtube', src:`https://www.youtube.com/embed/${yt[1]}` };

  // Facebook (page/video path)
  const fb = u.match(/facebook\.com\/[^/]+\/videos\/(\d+)/);
  if(fb){
    const encoded = encodeURIComponent(u.split('?')[0]); // use canonical path
    return { type:'facebook', src:`https://www.facebook.com/plugins/video.php?href=${encoded}&show_text=false` };
  }

  return { type:'other', src:u };
}

/* ---------- WP cleaners ---------- */
function stripEmptyBlocks(html=''){
  let s = String(html);
  s = s.replace(/<div[^>]*class=["'][^"']*mceTemp[^"']*["'][^>]*>.*?<\/div>/gis,'');
  s = s.replace(/<figure[^>]*>\s*<\/figure>/gis,'');
  s = s.replace(/<figcaption>\s*<\/figcaption>/gis,'');
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gis,'');
  s = s.replace(/<p>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s<\/p>/gis,'');
  return s;
}

/* ---------- UI helpers ---------- */
function backButtonHTML(){
  return `<button type="button" class="oko-btn-back" data-nav="back">← Back to Posts</button>`;
}
function posterHTML(src, title){
  if(!src) return '';
  return `
    <div class="oko-video-poster" role="button" tabindex="0" aria-label="Play video">
      <img src="${src}" alt="${decode(title)}" class="oko-video-poster__img">
      <button class="oko-video-poster__play" aria-label="Play video">▶</button>
    </div>`;
}
function playerHTML(embed){
  if(!embed?.src) return '';
  const common = `loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="no-referrer-when-downgrade" frameborder="0"`;
  return `
    <div class="oko-video-embed">
      <iframe src="${embed.src}" ${common}></iframe>
    </div>`;
}

/* ---------- render ---------- */
export default async function renderDetail(app, idParam){
  const mount = app || document.getElementById('app');
  const id = Array.isArray(idParam)? idParam[0] : idParam;

  if(!API_BASE){ mount.innerHTML=`<section class="page-error"><p>Page error: API base missing.</p></section>`; return; }
  if(!id){ mount.innerHTML=`<section class="page-error"><p>Page error: missing id.</p></section>`; return; }

  mount.innerHTML = `
    <article class="post-detail">
      <div class="oko-actions-top">${backButtonHTML()}</div>
      <figure class="post-media" style="margin:0 0 1rem 0"></figure>
      <header class="post-header">
        <h1 class="post-title" style="margin:.5rem 0">Loading…</h1>
        <div class="post-meta" style="color:#666"></div>
      </header>
      <div class="post-content" style="line-height:1.7">Please wait…</div>
      <div class="oko-actions-bottom" style="margin-top:1.25rem">${backButtonHTML()}</div>
    </article>
  `;

  const $title = mount.querySelector('.post-title');
  const $meta  = mount.querySelector('.post-meta');
  const $media = mount.querySelector('.post-media');
  const $body  = mount.querySelector('.post-content');

  mount.addEventListener('click',(e)=>{
    const b = e.target.closest('[data-nav="back"]');
    if(b){ e.preventDefault(); window.location.hash = '#/'; }
  });

  let post;
  try{
    post = await apiJSON(`posts/${encodeURIComponent(id)}`, {_embed:1});
  }catch(err){
    console.error('[Detail] fetch failed', err);
    $body.innerHTML = `<p class="error" style="color:#b00">Failed to load post.</p>`;
    return;
  }

  const title  = post.title?.rendered || '(Untitled)';
  const author = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date   = prettyDate(post.date || post.date_gmt);
  const contentRaw = post.content?.rendered || '';

  $title.innerHTML = title;
  $meta.textContent = `By ${author} — ${date}`;

  // media: poster first, then embed when clicked
  const poster = featuredSrc(post);
  const vidURL = extractVideoURL(contentRaw);
  const embed  = vidURL ? normalizePlayerSrc(vidURL) : null;

  if(poster && embed){
    $media.innerHTML = posterHTML(poster, decode(title));
    const posterEl = $media.querySelector('.oko-video-poster');
    const swap = ()=>{ $media.innerHTML = playerHTML(embed); };
    posterEl?.addEventListener('click', swap);
    posterEl?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); swap(); }});
  }else if(embed){
    $media.innerHTML = playerHTML(embed);
  }else if(poster){
    $media.innerHTML = `<img src="${poster}" alt="" style="width:100%;height:auto;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);">`;
  }else{
    // nothing to show → drop wrapper to avoid big gap
    $media.remove();
  }

  // content cleanup & render
  let content = stripEmptyBlocks(contentRaw)
    .replaceAll('<iframe','<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:1rem 0;"')
    .replaceAll('<img','<img loading="lazy" style="max-width:100%;height:auto;border-radius:10px;margin:1rem 0;"');
  $body.innerHTML = content;

  // tidy first paragraph
  const firstP = $body.querySelector('p');
  if(firstP){
    firstP.innerHTML = firstP.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i,'').trimStart();
    firstP.style.textIndent='0';
  }

  // external links → new tab
  $body.querySelectorAll('a[href]').forEach(a=>{
    const href=a.getAttribute('href')||'';
    if(!href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')){
      a.target='_blank'; a.rel='noopener';
    }
  });
}

/* ---------- local styles ---------- */
const __once='oko-detail-media-first-v266';
if(!document.getElementById(__once)){
  const style=document.createElement('style'); style.id=__once; style.textContent=`
  .oko-actions-top{ margin:.4rem 0 .75rem 0; }
  .oko-btn-back{
    display:inline-flex;align-items:center;gap:.45rem;background:#1e63ff;color:#fff;border:0;
    border-radius:999px;padding:.5rem .9rem;font-weight:600;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.12)
  }
  .oko-btn-back:hover{filter:brightness(1.05)} .oko-btn-back:active{transform:translateY(1px)}
  .oko-video-poster{position:relative;display:block;border-radius:12px;overflow:hidden;background:#000;margin:0 0 1rem 0}
  .oko-video-poster__img{display:block;width:100%;height:auto;opacity:.98;transition:transform .18s ease, opacity .18s ease}
  .oko-video-poster:hover .oko-video-poster__img{transform:scale(1.01);opacity:1}
  .oko-video-poster__play{
    position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:0;border-radius:999px;
    padding:.7rem 1rem;font-size:1.05rem;background:#1e63ff;color:#fff;box-shadow:0 6px 16px rgba(0,0,0,.22);cursor:pointer;z-index:3
  }
  .oko-video-embed{position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000;margin:0 0 1rem 0}
  .oko-video-embed iframe{position:absolute;inset:0;width:100%;height:100%}
  `; document.head.appendChild(style);
}
