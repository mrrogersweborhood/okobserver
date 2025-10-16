/* OkObserver · detail.v263.js · v2.7.10
   Fixes:
   • Ensures title never has blue background
   • Ensures author/date byline always shows directly under the title
   • Preserves all existing layout, logic, and lazy loading
*/

const API_BASE = (window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2').replace(/\/+$/, '');
console.log('[Detail] API_BASE =', API_BASE);

function joinUrl(base, path){ const b=(base||'').replace(/\/+$/,''); const p=(path||'').replace(/^\/+/,''); return `${b}/${p}`; }
function qs(params={}){ const u=new URLSearchParams(); for(const [k,v] of Object.entries(params)){ if(v==null||v==='') continue; Array.isArray(v)?v.forEach(x=>u.append(k,x)):u.append(k,v) } const s=u.toString(); return s?`?${s}`:''; }
async function apiJSON(pathOrUrl, params){ const url = pathOrUrl.startsWith('http')? pathOrUrl+qs(params) : joinUrl(API_BASE, pathOrUrl)+qs(params); const r=await fetch(url,{headers:{accept:'application/json'}}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
const prettyDate = iso => { try { return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}) } catch { return iso||'' } };
const decode = (html='') => { const d=document.createElement('div'); d.innerHTML=html; return d.textContent||d.innerText||'' }

function sanitizeMediaURL(raw){
  if(!raw) return null;
  let u = String(raw).replace(/&amp;/g,'&').trim();
  const canonical = u.split('#')[0].split('&')[0];
  try {
    const urlObj = new URL(canonical);
    if (/vimeo\.com|youtube\.com|youtu\.be|facebook\.com/i.test(urlObj.hostname))
      return `${urlObj.origin}${urlObj.pathname}`;
    return canonical;
  } catch { return canonical; }
}

function featuredSrc(post){
  const fm = post?._embedded?.['wp:featuredmedia']?.[0];
  return fm?.media_details?.sizes?.large?.source_url
      || fm?.media_details?.sizes?.medium_large?.source_url
      || fm?.source_url || '';
}

function extractVideoURL(html=''){
  const unwrap = html.replace(/&amp;/g,'&');
  const d = document.createElement('div'); d.innerHTML = unwrap;
  for (const a of d.querySelectorAll('a[href]')) {
    const href=(a.getAttribute('href')||'').replace(/&amp;/g,'&');
    if (/vimeo\.com\/\d+/.test(href)) return href;
    if (/(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/.test(href)) return href;
    if (/facebook\.com\/[^/]+\/(videos|posts)\/\d+/.test(href)) return href;
  }
  const f=d.querySelector('iframe[src*="vimeo.com"],iframe[src*="youtube.com"],iframe[src*="youtu.be"],iframe[src*="facebook.com"]');
  if (f) return (f.getAttribute('src')||'').replace(/&amp;/g,'&');
  const txt = d.textContent||'';
  const vm = txt.match(/https?:\/\/(?:www\.)?vimeo\.com\/\d+/); if (vm) return vm[0];
  const yt = txt.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/); if (yt) return yt[0];
  const fb = txt.match(/https?:\/\/(?:www\.)?facebook\.com\/[^ \n]+\/(?:videos|posts)\/\d+/); if (fb) return fb[0];
  return null;
}

function normalizePlayer(url){
  if (!url) return null;
  const u = url.replace(/&amp;/g,'&');
  const vimeo = u.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { type:'vimeo', src:`https://player.vimeo.com/video/${vimeo[1]}` };
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return { type:'youtube', src:`https://www.youtube.com/embed/${yt[1]}` };
  const fbPost = /facebook\.com\/[^/]+\/posts\/\d+/.test(u);
  const fbVideo = /facebook\.com\/[^/]+\/videos\/\d+/.test(u);
  if (fbPost || fbVideo) {
    const canonical = encodeURIComponent(u.split('?')[0]);
    return { type:'facebook', src:`https://www.facebook.com/plugins/post.php?href=${canonical}&show_text=true&width=700` };
  }
  return { type:'other', src:u };
}

function stripEmptyBlocks(html=''){
  let s = String(html);
  s = s.replace(/<div[^>]*class=["'][^"']*mceTemp[^"']*["'][^>]*>.*?<\/div>/gis,'');
  s = s.replace(/<figure[^>]*>\s*<\/figure>/gis,'');
  s = s.replace(/<figcaption>\s*<\/figcaption>/gis,'');
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gis,'');
  s = s.replace(/<p>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s<\/p>/gis,'');
  return s;
}

/* ----------------------------- renderer ---------------------------- */
export default async function renderDetail(a, b){
  let mount, id;
  const looksLikeId = x => (typeof x === 'string' || typeof x === 'number') && /^\d+$/.test(String(x).trim());

  if (a instanceof Element || (typeof a === 'string' && (document.getElementById(a) || /^[.#\[]/.test(a)))) {
    mount = a instanceof Element ? a : document.querySelector(a);
    id = Array.isArray(b) ? b[0] : b;
  } else {
    mount = document.getElementById('app') || document.body;
    id = Array.isArray(a) ? a[0] : a;
  }
  if (!id && looksLikeId(a)) id = a;

  if(!API_BASE){ mount.innerHTML = `<section class="page-error"><p>Page error: API base missing.</p></section>`; return; }
  if(!id){ mount.innerHTML = `<section class="page-error"><p>Page error: missing id.</p></section>`; return; }

  let post;
  try {
    post = await apiJSON(`posts/${encodeURIComponent(id)}`, {_embed:1});
  } catch (err) {
    console.error('[Detail] fetch failed', err);
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1.25rem auto;padding:1rem">
      <p class="error" style="color:#b00">Failed to load post.</p>
      <p><a class="oko-btn-back" href="#/">← Back to Posts</a></p>
    </section>`;
    return;
  }

  const rawTitle = post.title?.rendered || '(Untitled)';
  const author   = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date     = prettyDate(post.date || post.date_gmt);
  const poster   = featuredSrc(post);
  const contentRaw = post.content?.rendered || '';

  const dirtyUrl = extractVideoURL(contentRaw);
  const cleanUrl = sanitizeMediaURL(dirtyUrl);
  const embed    = cleanUrl ? normalizePlayer(cleanUrl) : null;

  const mediaHTML = (() => {
    if (poster && embed && embed.type !== 'facebook') {
      const titleText = decode(rawTitle);
      return `<figure class="post-media" style="margin:0 0 1rem 0">${posterHTML(poster, titleText)}</figure>`;
    }
    if (embed) return `<figure class="post-media">${playerHTML(embed)}</figure>`;
    if (poster) return `<figure class="post-media"><img src="${poster}" alt="" class="oko-detail-img" loading="lazy" decoding="async"></figure>`;
    return '';
  })();

  let content = stripEmptyBlocks(contentRaw)
    .replaceAll('<iframe','<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:1rem 0;"')
    .replaceAll('<img','<img loading="lazy" decoding="async" style="max-width:100%;height:auto;border-radius:10px;margin:1rem 0;"');

  mount.innerHTML = `
    <article class="post-detail">
      <div class="oko-actions-top">${backButtonHTML()}</div>
      ${mediaHTML}
      <header class="post-header">
        <h1 class="post-title">${rawTitle}</h1>
        <div class="post-meta">By ${author} — ${date}</div>
      </header>
      <div class="post-content">${content}</div>
      <div class="oko-actions-bottom" style="margin-top:1.1rem">${backButtonHTML()}</div>
    </article>
  `;

  // Ensure video poster swap
  const posterEl = mount.querySelector('.oko-video-poster');
  if (posterEl && embed && embed.type !== 'facebook') {
    const swap = () => {
      const fig = posterEl.closest('.post-media');
      if (fig) fig.innerHTML = playerHTML(embed);
    };
    posterEl.addEventListener('click', swap);
    posterEl.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); swap(); }});
  }

  mount.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav="back"]');
    if (b) { e.preventDefault(); window.location.hash = '#/'; }
  });

  const firstP = mount.querySelector('.post-content p');
  if (firstP){
    firstP.innerHTML = firstP.innerHTML.replace(/^(&nbsp;|\s|<br\s*\/?>)+/i,'').trimStart();
    firstP.style.textIndent='0';
  }

  const fig = mount.querySelector('.post-detail .post-media');
  if (fig) {
    const hasStuff = fig.querySelector('iframe, img, video, .oko-video-poster');
    if (!hasStuff) fig.remove(); else {
      const check = () => {
        const iframe = fig.querySelector('iframe');
        if (iframe && iframe.offsetHeight < 40) fig.remove();
      };
      requestAnimationFrame(check);
      setTimeout(check, 1200);
    }
  }

  // --- Permanent header/byline normalizer ---
  (function normalizeDetailHeader(){
    const article = document.querySelector('.post-detail');
    if (!article) return;
    const header = article.querySelector('.post-header') || article.querySelector('header') || article;
    const h1 = header.querySelector('h1.post-title, h1, .post-title');
    if (!h1) {
      const fallback = document.createElement('h1');
      fallback.className = 'post-title';
      fallback.textContent = decode(post?.title?.rendered || '(Untitled)');
      header.insertBefore(fallback, header.firstChild);
    }
    const titleEl = header.querySelector('h1.post-title, h1, .post-title');
    titleEl.classList.forEach(cls => { if (/has-.*-background|bg-|background|box|panel/i.test(cls)) titleEl.classList.remove(cls); });
    titleEl.setAttribute('style', `${titleEl.getAttribute('style')||''};background:transparent !important;background-image:none !important;box-shadow:none !important;border:0 !important;outline:0 !important;padding:0 !important;margin:.6rem 0 .25rem 0 !important;color:#111 !important;`);
    let meta = header.querySelector('.post-meta');
    const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
    const date   = prettyDate(post.date || post.date_gmt);
    const desiredHTML = `By ${author} — ${date}`;
    if (!meta) { meta = document.createElement('div'); meta.className = 'post-meta'; header.insertBefore(meta, titleEl.nextSibling); }
    if (meta.previousElementSibling !== titleEl) header.insertBefore(meta, titleEl.nextSibling);
    meta.innerHTML = desiredHTML;
    meta.setAttribute('style', `${meta.getAttribute('style')||''};display:block !important;margin:.25rem 0 .9rem 0 !important;color:#666 !important;background:transparent !important;`);
  })();
}

/* --- Inline CSS --- */
const __once = 'oko-detail-scope-v2710';
if (!document.getElementById(__once)) {
  const style = document.createElement('style');
  style.id = __once;
  style.textContent = `
  .post-detail{max-width:980px;margin:0 auto 56px;padding:8px 12px 24px;background:transparent;border:0;box-shadow:none}
  .post-media{margin:0 auto .75rem auto;max-width:900px}
  .oko-video-poster__img{display:block;width:100%;height:auto;border-radius:12px}
  .post-header h1.post-title{background:transparent !important}
  .post-header .post-meta{color:#666;font-size:14px;margin:.25rem 0 .9rem 0}
  .post-content{line-height:1.7;color:#222}
  `;
  document.head.appendChild(style);
}

function backButtonHTML(){ return `<button type="button" class="oko-btn-back" data-nav="back">← Back to Posts</button>`; }
function posterHTML(src, title){
  if(!src) return '';
  return `<div class="oko-video-poster" role="button" tabindex="0"><img src="${src}" alt="${decode(title)}" class="oko-video-poster__img" loading="lazy" decoding="async"><button class="oko-video-poster__play" aria-label="Play video">▶</button></div>`;
}
function playerHTML(embed){
  if(!embed?.src) return '';
  return `<div class="oko-video-embed"><iframe src="${embed.src}" loading="lazy" allowfullscreen frameborder="0"></iframe></div>`;
}
