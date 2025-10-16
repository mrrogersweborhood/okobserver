/* OkObserver · detail.v263.js · v2.7.5
   Poster→click-to-play (YouTube/Vimeo), Facebook plugin for FB links.
   Title has no background; author + pretty date shown; back buttons.
   Works with calls as (id) or (container, id).
*/

const API_BASE = (window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2').replace(/\/+$/, '');

// ---------- tiny utils ----------
function joinUrl(base, path){const b=(base||'').replace(/\/+$/,'');const p=(path||'').replace(/^\/+/, '');return `${b}/${p}`;}
function qs(params={}){const u=new URLSearchParams();for(const [k,v] of Object.entries(params)){if(v==null||v==='')continue;Array.isArray(v)?v.forEach(x=>u.append(k,x)):u.append(k,v)}const s=u.toString();return s?`?${s}`:'';}
async function apiJSON(pathOrUrl, params){const url = pathOrUrl.startsWith('http')? pathOrUrl+qs(params) : joinUrl(API_BASE, pathOrUrl)+qs(params); const r=await fetch(url,{headers:{accept:'application/json'}}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json();}
const prettyDate = iso => { try { return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}) } catch { return iso||'' } };
const decode = (html='') => { const d=document.createElement('div'); d.innerHTML=html; return d.textContent||d.innerText||'' }

// Ensure we always have an Element; don’t treat numeric IDs as selectors
function asEl(target){
  if (target instanceof Element) return target;
  if (typeof target === 'string') {
    const t = target.trim();
    if (/^[.#\[]/.test(t)) { try { const q=document.querySelector(t); if (q) return q; } catch{} }
    const byId = document.getElementById(t); if (byId) return byId;
  }
  return document.getElementById('app') || document.body;
}

// ---------- media helpers ----------
function featuredSrc(post){
  const fm = post?._embedded?.['wp:featuredmedia']?.[0];
  return fm?.media_details?.sizes?.large?.source_url
      || fm?.media_details?.sizes?.medium_large?.source_url
      || fm?.source_url || '';
}
function extractVideoURL(html=''){
  const unwrap = html.replace(/&amp;/g,'&');
  const d = document.createElement('div'); d.innerHTML = unwrap;
  for(const a of d.querySelectorAll('a[href]')){
    const href=(a.getAttribute('href')||'').replace(/&amp;/g,'&');
    if(/vimeo\.com\/\d+/.test(href)) return href;
    if(/(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/.test(href)) return href;
    if(/facebook\.com\/[^/]+\/(videos|posts)\/\d+/.test(href)) return href;
  }
  const f=d.querySelector('iframe[src*="vimeo.com"],iframe[src*="youtube.com"],iframe[src*="youtu.be"],iframe[src*="facebook.com"]');
  if(f) return (f.getAttribute('src')||'').replace(/&amp;/g,'&');
  const text=d.textContent||'';
  const vm=text.match(/https?:\/\/(?:www\.)?vimeo\.com\/\d+/); if(vm) return vm[0];
  const yt=text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/); if(yt) return yt[0];
  const fb=text.match(/https?:\/\/(?:www\.)?facebook\.com\/[^ \n]+\/(?:videos|posts)\/\d+/); if(fb) return fb[0];
  return null;
}
function normalizePlayer(url){
  if(!url) return null;
  const u = url.replace(/&amp;/g,'&');
  const vimeo = u.match(/vimeo\.com\/(\d+)/);
  if(vimeo) return { type:'vimeo', src:`https://player.vimeo.com/video/${vimeo[1]}` };
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if(yt) return { type:'youtube', src:`https://www.youtube.com/embed/${yt[1]}` };
  const fbPost = /facebook\.com\/[^/]+\/posts\/\d+/.test(u);
  const fbVideo = /facebook\.com\/[^/]+\/videos\/\d+/.test(u);
  if (fbPost || fbVideo) {
    const canonical = encodeURIComponent(u.split('?')[0]);
    return { type:'facebook', src:`https://www.facebook.com/plugins/post.php?href=${canonical}&show_text=true&width=700` };
  }
  return { type:'other', src:u };
}

// ---------- WP cleanup ----------
function stripEmptyBlocks(html=''){
  let s = String(html);
  s = s.replace(/<div[^>]*class=["'][^"']*mceTemp[^"']*["'][^>]*>.*?<\/div>/gis,'');
  s = s.replace(/<figure[^>]*>\s*<\/figure>/gis,'');
  s = s.replace(/<figcaption>\s*<\/figcaption>/gis,'');
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gis,'');
  s = s.replace(/<p>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s<\/p>/gis,'');
  return s;
}

// ---------- UI bits ----------
function backButtonHTML(){ return `<button type="button" class="oko-btn-back" data-nav="back">← Back to Posts</button>`; }
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
  return `
    <div class="oko-video-embed">
      <iframe
        src="${embed.src}"
        title="Embedded media"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        referrerpolicy="no-referrer-when-downgrade"
        frameborder="0"></iframe>
    </div>`;
}

// ---------- main render ----------
export default async function renderDetail(a, b){
  // Accept either: (container, id) OR (id)
  let mount, id;
  const looksLikeId = x => (typeof x === 'string' || typeof x === 'number') && /^\d+$/.test(String(x).trim());

  if (a instanceof Element || (typeof a === 'string' && (document.getElementById(a) || /^[.#\[]/.test(a)))) {
    // Called as (container, id)
    mount = asEl(a);
    id = Array.isArray(b) ? b[0] : b;
  } else {
    // Called as (id)
    mount = asEl('#app');
    id = Array.isArray(a) ? a[0] : a;
  }
  if (!id && looksLikeId(a)) id = a;

  if(!API_BASE){ mount.innerHTML = `<section class="page-error"><p>Page error: API base missing.</p></section>`; return; }
  if(!id){ mount.innerHTML = `<section class="page-error"><p>Page error: missing id.</p></section>`; return; }

  mount.innerHTML = `
    <article class="post-detail">
      <div class="oko-actions-top">${backButtonHTML()}</div>
      <figure class="post-media" style="margin:0 0 1rem 0"></figure>
      <header class="post-header">
        <h1 class="post-title">Loading…</h1>
        <div class="post-meta"></div>
      </header>
      <div class="post-content">Please wait…</div>
      <div class="oko-actions-bottom" style="margin-top:1.1rem">${backButtonHTML()}</div>
    </article>
  `;

  const $title = mount.querySelector('.post-title');
  const $meta  = mount.querySelector('.post-meta');
  const $media = mount.querySelector('.post-media');
  const $body  = mount.querySelector('.post-content');

  // back buttons
  mount.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav="back"]');
    if (b) { e.preventDefault(); window.location.hash = '#/'; }
  });

  // fetch
  let post;
  try{
    post = await apiJSON(`posts/${encodeURIComponent(id)}`, {_embed:1});
  }catch(err){
    console.error('[Detail] fetch failed', err);
    $body.innerHTML = `<p class="error" style="color:#b00">Failed to load post.</p>`;
    return;
  }

  // header
  const rawTitle = post.title?.rendered || '(Untitled)';
  const author   = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date     = prettyDate(post.date || post.date_gmt);
  const contentRaw = post.content?.rendered || '';

  $title.innerHTML = rawTitle;
  $meta.textContent = `By ${author} — ${date}`;

  // media first (poster + click-to-play for YT/Vimeo; FB plugin inline)
  const poster = featuredSrc(post);
  const url = extractVideoURL(contentRaw);
  const embed = url ? normalizePlayer(url) : null;

  if (poster && embed && embed.type !== 'facebook') {
    $media.innerHTML = posterHTML(poster, decode(rawTitle));
    const posterEl = $media.querySelector('.oko-video-poster');
    const swap = () => { $media.innerHTML = playerHTML(embed); };
    posterEl?.addEventListener('click', swap);
    posterEl?.addEventListener('keydown', (e) => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); swap(); }});
  } else if (embed) {
    $media.innerHTML = playerHTML(embed);
  } else if (poster) {
    $media.innerHTML = `<img src="${poster}" alt="" class="oko-detail-img">`;
  } else {
    $media.remove();
  }

  // content body
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
}

/* ---------- scoped styles (title reset + media sizing + buttons) ---------- */
const __once = 'oko-detail-scope-v275';
if (!document.getElementById(__once)) {
  const style = document.createElement('style');
  style.id = __once;
  style.textContent = `
  .post-detail{max-width:980px;margin:0 auto 56px;padding:8px 12px 24px;background:transparent;border:0;box-shadow:none}
  .oko-actions-top{margin:.5rem 0 .9rem 0}
  .oko-btn-back{display:inline-flex;align-items:center;gap:.45rem;background:#1e63ff;color:#fff;border:0;border-radius:999px;padding:.5rem .9rem;font-weight:600;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.12)}
  .oko-btn-back:hover{filter:brightness(1.05)} .oko-btn-back:active{transform:translateY(1px)}
  .post-media{margin:0 auto 1rem auto;max-width:900px}
  .oko-video-poster{position:relative;display:block;border-radius:12px;overflow:hidden;background:#000}
  .oko-video-poster__img{display:block;width:100%;height:auto;opacity:.98;transition:transform .18s ease,opacity .18s ease}
  .oko-video-poster:hover .oko-video-poster__img{transform:scale(1.01);opacity:1}
  .oko-video-poster__play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:0;border-radius:999px;padding:.7rem 1rem;font-size:1.05rem;background:#1e63ff;color:#fff;box-shadow:0 6px 16px rgba(0,0,0,.22);cursor:pointer;z-index:3}
  .oko-video-embed{position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000;margin:0}
  .oko-video-embed iframe{position:absolute;inset:0;width:100%;height:100%}
  .oko-detail-img{display:block;width:100%;height:auto;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .post-detail .post-header h1.post-title,
  .post-detail .post-header .post-title,
  .post-detail h1.post-title{
    background:transparent !important;background-image:none !important;border:none !important;box-shadow:none !important;outline:0 !important;
    padding:0 !important;margin:.6rem 0 .2rem 0 !important;color:#111 !important;line-height:1.2;font-weight:800;
  }
  .post-detail .post-header h1.post-title::before,
  .post-detail .post-header h1.post-title::after,
  .post-detail .post-header .post-title::before,
  .post-detail .post-header .post-title::after{
    content:none !important; display:none !important;
  }
  .post-header .post-meta{color:#666;font-size:14px;margin:0 0 .75rem 0}
  .post-content{line-height:1.7;color:#222}
  .post-content img{max-width:100%;height:auto;border-radius:10px;margin:1rem 0}
  `;
  document.head.appendChild(style);
}
export { renderDetail as renderPostDetail };
// --- Safety: ensure author + date render in post detail ---
(function ensureByline() {
  try {
    const root = document.querySelector('.post-detail') || document.querySelector('#post-detail') || document.querySelector('#app article');
    if (!root) return;

    // If byline already exists, leave it alone
    const hasByline = root.querySelector('.post-byline, .post-meta, .post-date');
    if (hasByline) return;

    // Try to read data from any dataset your renderer set on the container
    const titleEl = root.querySelector('.post-title');
    const isoDate = root.dataset?.date || root.getAttribute('data-date'); // e.g., "2025-10-10T12:34:56Z"
    const author = root.dataset?.author || root.getAttribute('data-author'); // e.g., "Arnold Hamilton"

    // Format date (fallback to locale)
    let prettyDate = '';
    if (isoDate) {
      const d = new Date(isoDate);
      if (!isNaN(d)) prettyDate = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // Build a simple byline if we have at least one piece of info
    if (author || prettyDate) {
      const meta = document.createElement('div');
      meta.className = 'post-meta';
      meta.style.margin = '0 0 .75rem 0';
      meta.style.color = '#6b7280';
      meta.style.fontSize = '.95rem';
      meta.textContent = [author, prettyDate].filter(Boolean).join(' • ');
      // Insert after title, or at top if no title found
      if (titleEl && titleEl.parentNode) {
        titleEl.parentNode.insertBefore(meta, titleEl.nextSibling);
      } else {
        root.insertBefore(meta, root.firstChild);
      }
    }
  } catch (e) {
    console.warn('[detail] ensureByline skipped:', e);
  }
})();

// Ensure post byline (author • date) appears under the title on detail view
(() => {
  try {
    const article = document.querySelector('article.post-detail');
    if (!article) return;

    // Already present? bail.
    if (article.querySelector('.post-meta, .post-byline, .post-date')) return;

    // Try to read from known places first
    const author =
      article.dataset.author ||
      article.getAttribute('data-author') ||
      window.__okPost?.author?.name ||
      window.__okPost?.yoast_head_json?.author ||
      '';

    const iso =
      article.dataset.date ||
      article.getAttribute('data-date') ||
      window.__okPost?.date ||
      '';

    let prettyDate = '';
    if (iso) {
      const d = new Date(iso);
      if (!isNaN(d)) {
        prettyDate = d.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
    }

    // If we still have nothing, attempt to fetch by ID in the URL #/post/<id>
    const needsFetch = !author && !prettyDate;
    const maybeId = (location.hash.match(/post\/(\d+)/) || [])[1];

    const insertMeta = (text) => {
      if (!text) return;
      const title = article.querySelector('.post-title');
      const meta = document.createElement('div');
      meta.className = 'post-meta';
      meta.textContent = text;
      meta.style.margin = '0 0 .75rem 0';
      meta.style.color = '#6b7280';
      meta.style.fontSize = '.95rem';
      if (title && title.parentNode) {
        title.parentNode.insertBefore(meta, title.nextSibling);
      } else {
        article.insertBefore(meta, article.firstChild);
      }
    };

    if (!needsFetch) {
      const parts = [author, prettyDate].filter(Boolean);
      insertMeta(parts.join(' • '));
      return;
    }

    if (maybeId) {
      const base = (window.__OKOBSERVER_API_BASE || '').replace(/\/+$/, '');
      const url = `${base}/posts/${maybeId}`;
      fetch(url)
        .then(r => r.ok ? r.json() : null)
        .then(p => {
          if (!p) return;
          const a =
            p._embedded?.author?.[0]?.name ||
            p.author_name || // sometimes custom field
            '';
          const d = p.date ? new Date(p.date) : null;
          const pd = d && !isNaN(d) ? d.toLocaleDateString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric'
          }) : '';
          const txt = [a, pd].filter(Boolean).join(' • ');
          insertMeta(txt);
        })
        .catch(() => {});
    }
  } catch (e) {
    console.warn('[detail] byline ensure failed', e);
  }
})();
// --- Append-only: ensure byline (author • date) on post detail ---
(() => {
  try {
    const article =
      document.querySelector('article.post-detail') ||
      document.querySelector('#post-detail') ||
      document.querySelector('#app article');

    if (!article) return;

    // If a byline/meta already exists, do nothing.
    if (article.querySelector('.post-meta, .post-byline, .post-date')) return;

    // Try common data sources first
    const fromDS = {
      author:
        article.dataset?.author ||
        article.getAttribute('data-author') ||
        (window.__okPost && (window.__okPost.author?.name || window.__okPost._embedded?.author?.[0]?.name)) ||
        '',
      isoDate:
        article.dataset?.date ||
        article.getAttribute('data-date') ||
        (window.__okPost && (window.__okPost.date || window.__okPost.date_gmt)) ||
        ''
    };

    const pretty = (iso) => {
      const d = new Date(iso);
      return isNaN(d) ? '' : d.toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric'
      });
    };

    const insertMeta = (text) => {
      if (!text) return;
      const titleEl =
        article.querySelector('.post-title') ||
        article.querySelector('h1, h2');
      const meta = document.createElement('div');
      meta.className = 'post-meta';
      meta.textContent = text;
      meta.style.margin = '0 0 .75rem 0';
      meta.style.color = '#6b7280';
      meta.style.fontSize = '.95rem';
      meta.style.lineHeight = '1.4';
      if (titleEl && titleEl.parentNode) {
        titleEl.parentNode.insertBefore(meta, titleEl.nextSibling);
      } else {
        article.insertBefore(meta, article.firstChild);
      }
    };

    // If we already have either author or date, render immediately
    const immediate = [fromDS.author, pretty(fromDS.isoDate)].filter(Boolean).join(' • ');
    if (immediate) { insertMeta(immediate); return; }

    // Fallback: fetch by ID from URL if nothing available
    const idMatch = location.hash.match(/post\/(\d+)/);
    const postId = idMatch ? idMatch[1] : null;
    const apiBase = (window.__OKOBSERVER_API_BASE || '').replace(/\/+$/, '');

    if (!postId || !apiBase) return;

    fetch(`${apiBase}/posts/${postId}?_embed=author`)
      .then(r => r.ok ? r.json() : null)
      .then(p => {
        if (!p) return;
        const a = p._embedded?.author?.[0]?.name || '';
        const pd = pretty(p.date || p.date_gmt);
        const txt = [a, pd].filter(Boolean).join(' • ');
        insertMeta(txt);
      })
      .catch(() => { /* ignore */ });

  } catch (e) {
    console.warn('[detail] ensureByline error:', e);
  }
})();
// --- Append-only: show loading UI only if fetch is slow ---
(function delayDetailLoader(){
  const app = document.getElementById('app');
  if (!app) return;

  // If we already rendered the detail, do nothing.
  if (app.querySelector('article.post-detail')) return;

  // Schedule a deferred loader (700ms). If content renders before that, we won't show it.
  let loaderTimer = setTimeout(() => {
    // still nothing on screen; show a minimal loader card
    if (app && !app.querySelector('article.post-detail')) {
      const ghost = document.createElement('div');
      ghost.id = 'post-detail-loader';
      ghost.innerHTML = `
        <section class="ok-card" style="padding:1rem 1.25rem;margin:1.25rem auto;max-width:920px">
          <a class="ok-btn" href="#/" style="display:inline-block;margin-bottom:.75rem">← Back to Posts</a>
          <div style="font-weight:700;color:#0f3d8a">Loading…</div>
          <p style="margin:.25rem 0 0;color:#555">Please wait…</p>
        </section>
      `;
      app.appendChild(ghost);
    }
  }, 700);

  // When the real article appears, remove the loader and cancel the timer
  const obs = new MutationObserver(() => {
    if (app.querySelector('article.post-detail')) {
      clearTimeout(loaderTimer);
      const ghost = document.getElementById('post-detail-loader');
      if (ghost) ghost.remove();
      obs.disconnect();
    }
  });
  obs.observe(app, { childList: true, subtree: true });

  // Safety: also clear if we navigate away
  window.addEventListener('hashchange', () => {
    clearTimeout(loaderTimer);
    const ghost = document.getElementById('post-detail-loader');
    if (ghost) ghost.remove();
    obs.disconnect();
  }, { once: true });
})();
// --- Append-only: delayed detail loader (gentler timing) ---
(function delayDetailLoaderV2(){
  const app = document.getElementById('app');
  if (!app) return;

  // Skip if detail already rendered
  if (app.querySelector('article.post-detail')) return;

  // Wait longer (~1.5s) before showing loader
  let loaderTimer = setTimeout(() => {
    if (app && !app.querySelector('article.post-detail')) {
      const ghost = document.createElement('div');
      ghost.id = 'post-detail-loader';
      ghost.innerHTML = `
        <section class="ok-card" style="padding:1rem 1.25rem;margin:1.25rem auto;max-width:920px">
          <a class="ok-btn" href="#/" style="display:inline-block;margin-bottom:.75rem">← Back to Posts</a>
          <div style="font-weight:700;color:#0f3d8a">Loading…</div>
          <p style="margin:.25rem 0 0;color:#555">Please wait…</p>
        </section>
      `;
      app.appendChild(ghost);
    }
  }, 1500); // increased from 700 ms → 1.5 s

  // When the real article appears, remove loader immediately
  const obs = new MutationObserver(() => {
    if (app.querySelector('article.post-detail')) {
      clearTimeout(loaderTimer);
      const ghost = document.getElementById('post-detail-loader');
      if (ghost) ghost.remove();
      obs.disconnect();
    }
  });
  obs.observe(app, { childList: true, subtree: true });

  // Also clear if navigating away early
  window.addEventListener('hashchange', () => {
    clearTimeout(loaderTimer);
    const ghost = document.getElementById('post-detail-loader');
    if (ghost) ghost.remove();
    obs.disconnect();
  }, { once: true });
})();

