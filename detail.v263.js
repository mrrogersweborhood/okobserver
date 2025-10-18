/* OkObserver — Detail view (stable export, no external decode import)
   - Works with window.apiJSON/window.API_BASE
   - Title + byline under title
   - Media:
       * if content has <iframe>, it renders inline (keeps provider sizing)
       * else if featured image exists, show image with play overlay only
         when we have a known video URL extracted; clicking swaps in player
   - Keeps console logs
*/

const dlog = (...a) => console.log('[Detail]', ...a);

const Module = (window.Module = window.Module || {});
const apiJSON = window.apiJSON || Module.apiJSON;
const API_BASE = window.API_BASE || Module.API_BASE;

const decode = (s='') => { const t=document.createElement('textarea'); t.innerHTML=s; return t.value; };

function prettyDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, {year:'numeric',month:'long',day:'numeric'}); }
  catch { return ''; }
}

function featuredSrc(post) {
  const m = post?._embedded?.['wp:featuredmedia']?.[0];
  return (
    m?.media_details?.sizes?.large?.source_url ||
    m?.media_details?.sizes?.medium_large?.source_url ||
    m?.source_url || ''
  );
}

// naive URL sniff
function extractVideoURL(html='') {
  const m = html.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+|player\.vimeo\.com\/video\/\d+|vimeo\.com\/\d+|facebook\.com\/[^"'\s]+)/i);
  return m ? m[0] : null;
}
function isFacebook(u=''){ return /facebook\.com/i.test(u); }
function isVimeo(u=''){ return /vimeo\.com/i.test(u); }
function isYouTube(u=''){ return /youtu/i.test(u); }

function fbEmbedHTML(url){
  // simple inline iframe (no SDK dependency to avoid slowdowns)
  const enc = encodeURIComponent(url);
  return `<iframe src="https://www.facebook.com/plugins/video.php?href=${enc}&show_text=false&width=800"
           style="width:100%;max-width:960px;aspect-ratio:16/9;border:0;border-radius:10px;overflow:hidden"
           scrolling="no" frameborder="0" allowfullscreen
           allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>`;
}
function vimeoEmbedHTML(url){
  // normalize plain vimeo URL to player
  const id = (url.match(/vimeo\.com\/(?:video\/)?(\d+)/)||[])[1];
  const src = id ? `https://player.vimeo.com/video/${id}` : url;
  return `<iframe src="${src}" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px"
           loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
}
function ytEmbedHTML(url){
  const id = (url.match(/[?&]v=([\w-]{6,})/)||url.match(/youtu\.be\/([\w-]{6,})/)||[])[1];
  const src = id ? `https://www.youtube.com/embed/${id}` : url;
  return `<iframe src="${src}" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px"
           loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
           allowfullscreen></iframe>`;
}

function posterHTML(src, title=''){
  return `
    <figure class="post-media" style="margin:0 0 1rem 0;position:relative">
      <img src="${src}" alt="" class="oko-detail-img" style="width:100%;height:auto;border-radius:10px;display:block">
      <button class="oko-video-poster" aria-label="Play video"
        style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
               width:72px;height:72px;border-radius:50%;border:0;cursor:pointer;
               background:rgba(0,0,0,.5);display:grid;place-items:center">
        <span style="display:block;width:0;height:0;border-left:20px solid #fff;border-top:12px solid transparent;border-bottom:12px solid transparent;margin-left:4px"></span>
      </button>
    </figure>`;
}

export default async function renderDetail(mountOrId, idMaybe){
  // Resolve mount + id
  let mount, id;
  if (mountOrId instanceof Element) {
    mount = mountOrId; id = idMaybe;
  } else if (typeof mountOrId === 'string' && document.getElementById(mountOrId)) {
    mount = document.getElementById(mountOrId); id = idMaybe;
  } else {
    mount = document.getElementById('app') || document.body; id = mountOrId;
  }

  if (!apiJSON || !API_BASE) {
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1rem auto;padding:1rem">
      <p class="error" style="color:#b00">API base missing.</p></section>`;
    return;
  }
  if (!id) {
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1rem auto;padding:1rem">
      <p class="error" style="color:#b00">Missing post id.</p></section>`;
    return;
  }

  dlog('API_BASE auto-set for direct page load');

  // Fetch FIRST (no premature UI)
  let post;
  try {
    post = await apiJSON(`posts/${encodeURIComponent(id)}`, {_embed:1});
  } catch (err) {
    console.error('[Detail] fetch failed', err);
    mount.innerHTML = `<section class="ok-card" style="max-width:920px;margin:1rem auto;padding:1rem">
      <p class="error" style="color:#b00">Failed to load post.</p>
      <p><a href="#/">← Back to Posts</a></p></section>`;
    return;
  }

  // Build HTML
  const rawTitle = post.title?.rendered || '(Untitled)';
  const title = decode(rawTitle);
  const author = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date   = prettyDate(post.date || post.date_gmt);
  const poster = featuredSrc(post);
  const contentRaw = post.content?.rendered || '';

  // decide media
  const inlineIframe = /<iframe/i.test(contentRaw);
  const externalUrl  = extractVideoURL(contentRaw);
  let mediaHTML = '';

  if (inlineIframe) {
    // keep publisher sizing but enforce safe width/rounded corners
    mediaHTML = contentRaw.replace(/<iframe/gi, '<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px"');
  } else if (externalUrl) {
    if (isFacebook(externalUrl)) mediaHTML = fbEmbedHTML(externalUrl);
    else if (isVimeo(externalUrl)) mediaHTML = vimeoEmbedHTML(externalUrl);
    else if (isYouTube(externalUrl)) mediaHTML = ytEmbedHTML(externalUrl);
    else mediaHTML = ''; // unknown provider — fall back to poster only
  } else if (poster) {
    // no video detected; just image
    mediaHTML = `<figure class="post-media"><img src="${poster}" alt="" class="oko-detail-img" style="width:100%;height:auto;border-radius:10px"></figure>`;
  }

  // final DOM write
  mount.innerHTML = `
    <article class="post-detail">
      <div class="oko-actions-top"><a class="oko-btn-back" href="#/">← Back to Posts</a></div>
      ${!inlineIframe && !externalUrl && poster ? posterHTML(poster, title) : mediaHTML}
      <header class="post-header">
        <h1 class="post-title" style="margin:.5rem 0 0">${title}</h1>
        <div class="post-meta" style="margin:.25rem 0 1rem;color:#5b6470">By ${author} — ${date}</div>
      </header>
      <div class="post-content">${contentRaw
        .replaceAll('<img','<img loading="lazy" style="max-width:100%;height:auto;border-radius:10px;margin:1rem 0;"')
        .replaceAll('<iframe','<iframe loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin:1rem 0;"')
      }</div>
      <div class="oko-actions-bottom" style="margin-top:1.1rem"><a class="oko-btn-back" href="#/">← Back to Posts</a></div>
    </article>
  `;

  // If we showed a poster with a detected video URL (non-Facebook), enable swap-on-click
  if (!inlineIframe && externalUrl && poster && !isFacebook(externalUrl)) {
    const posterBtn = mount.querySelector('.oko-video-poster');
    if (posterBtn) {
      const swap = () => {
        const fig = posterBtn.closest('.post-media');
        if (!fig) return;
        if (isVimeo(externalUrl)) fig.innerHTML = vimeoEmbedHTML(externalUrl);
        else if (isYouTube(externalUrl)) fig.innerHTML = ytEmbedHTML(externalUrl);
      };
      posterBtn.addEventListener('click', swap);
      posterBtn.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); swap(); }});
    }
  }

  dlog('renderDetail done');
}
