/* 🟢 PostDetail.js (v2025-10-28n) — robust body fallback + clear logging
   - If post.content.rendered is missing/empty, we render the excerpt instead.
   - Never leaves an empty page; shows a helpful note for paywalled/teaser posts.
   - Keeps safe video/image hero logic and tag pills.
*/

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPost, getImageCandidates, getPostHint } from './api.js?v=2025-10-28i';

function byline(post){
  const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date = formatDate(post.date);
  return `${author} • ${date}`;
}

function firstIframeSrc(html=''){
  try{ const d=document.createElement('div'); d.innerHTML=html; const f=d.querySelector('iframe[src]'); return f?f.getAttribute('src'):''; }
  catch{ return ''; }
}

function youTubeThumb(src=''){
  try{
    const m = src.match(/(?:youtube\.com\/(?:embed|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    const id = m && m[1];
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
  }catch{ return ''; }
}

function selfHostedVideo(post){
  try{
    const media = post?._embedded?.['wp:featuredmedia']?.[0];
    const mt = media?.mime_type || '';
    if (mt.startsWith('video/')){
      const src = media?.source_url || '';
      const s = media?.media_details?.sizes || {};
      const poster = (s.medium_large || s.large || s.full)?.source_url || '';
      return { src, poster };
    }
  }catch{}
  return { src:'', poster:'' };
}

function buildImageHero(post,{priority='high',alt='Featured image'}={}){
  const img = getImageCandidates(post);
  if(!img.src) return null;
  return el('img',{
    src:img.src, srcset:img.srcset||undefined, sizes:img.sizes||undefined,
    width:img.width||undefined, height:img.height||undefined,
    alt, loading:'eager', decoding:'async', fetchpriority:priority
  });
}

function buildClickPoster(src, href='', title='Play'){
  const img = el('img',{ src, alt:title, loading:'eager', decoding:'async' });
  const btn = el('button',{ class:'play-overlay','aria-label':'Play video' });
  const wrap = el('div',{ class:'hero-media is-image' }, img, btn);
  if(href) wrap.addEventListener('click', ()=>window.open(href,'_blank','noopener'));
  return wrap;
}

function buildIframe(src){
  const iframe = el('iframe',{
    src, loading:'lazy',
    allow:'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    allowfullscreen:'true', referrerpolicy:'no-referrer-when-downgrade', frameborder:'0'
  });
  const wrap = el('div',{ class:'video-wrapper' }, iframe);
  // Fail-safe: if it never loads (blocked), we can fallback.
  const t=setTimeout(()=>wrap.dispatchEvent(new CustomEvent('embed-timeout')),4000);
  iframe.addEventListener('load',()=>clearTimeout(t),{once:true});
  return wrap;
}

function buildVideoTag({src,poster}){
  if(!src) return null;
  const v = el('video',{ controls:true, playsinline:true, preload:'metadata', poster:poster||undefined },
    el('source',{ src, type:'video/mp4' })
  );
  return el('div',{ class:'video-wrapper' }, v);
}

function extractTagNames(post){
  try{
    const groups = post?._embedded?.['wp:term'];
    if(!Array.isArray(groups)) return [];
    const tags=[];
    for(const g of groups) for(const t of g||[]){
      if(t.taxonomy==='post_tag'){ const n=(t.name||'').trim(); if(n && !tags.includes(n)) tags.push(n); }
    }
    return tags;
  }catch{ return []; }
}
function renderTags(article, post){
  const names = extractTagNames(post);
  if(!names.length) return;
  const list = el('ul',{ class:'tag-list' }, ...names.map(n=>el('li',{}, el('span',{ class:'tag-pill' }, `#${decodeHTML(n)}`))));
  article.appendChild(el('div',{ class:'post-tags container' }, el('h4',{ class:'tag-title' },'Tags'), list));
}

/* ---------- Skeleton / Hint ---------- */
function renderSkeleton(mount){
  mount.innerHTML=`
    <article class="post container">
      <div class="skeleton hero"></div>
      <h1 class="skeleton title"></h1>
      <div class="skeleton byline"></div>
      <div class="skeleton para"></div>
      <div class="skeleton para"></div>
    </article>`;
}

function heroFrom(post){
  const title = decodeHTML(post?.title?.rendered || 'Untitled');
  const html  = post?.content?.rendered || post?.excerpt?.rendered || '';
  const embed = firstIframeSrc(html);
  const selfV = selfHostedVideo(post);

  if (embed){
    const poster = youTubeThumb(embed) || getImageCandidates(post).src || '';
    if (poster) return buildClickPoster(poster, embed, title);
    const img = buildImageHero(post,{alt:title});
    if (img) return img;
    return null;
  }
  if (selfV.src){
    const n = buildVideoTag(selfV);
    if (n) return n;
  }
  return buildImageHero(post,{alt:title});
}

function applyHint(mount, hint){
  const title = decodeHTML(hint?.title?.rendered || 'Untitled');
  const hero  = heroFrom(hint);

  const article = el('article',{ class:'post container' },
    el('div',{ class:'post-hero' }, hero || el('div',{ class:'media-fallback' },'')),
    el('h1',{ class:'post-title' }, title),
    el('div',{ class:'meta' }, byline(hint)),
  );
  mount.innerHTML=''; mount.appendChild(article);
  const body = el('div',{ class:'post-body' }); article.appendChild(body);
  return { article, body };
}

/* ---------- Full render with safe fallbacks ---------- */
function renderFull(dom, post){
  const title = decodeHTML(post?.title?.rendered || 'Untitled');
  const contentHTML = post?.content?.rendered || '';
  const excerptHTML = post?.excerpt?.rendered || '';

  if (!contentHTML || !contentHTML.trim()){
    console.warn('[OkObserver] detail: content.rendered was empty; falling back to excerpt.');
  }

  const htmlToUse = contentHTML && contentHTML.trim() ? contentHTML : `
    <div class="paywall-note" style="margin:1rem 0; opacity:.8">
      <em>This article’s full text is not available via the public API. Showing summary instead.</em>
    </div>
    ${excerptHTML || ''}`;

  dom.body.innerHTML = `<div class="post-content">${htmlToUse}</div>`;

  // Upgrade hero with real content context
  const heroWrap = dom.article.querySelector('.post-hero');
  const embed = firstIframeSrc(contentHTML);
  const selfV = selfHostedVideo(post);

  if (embed){
    const iframeNode = buildIframe(embed);
    heroWrap.replaceChildren(iframeNode);
    iframeNode.addEventListener('embed-timeout', ()=>{
      const poster = youTubeThumb(embed) || getImageCandidates(post).src || '';
      if (poster) heroWrap.replaceChildren(buildClickPoster(poster, embed, title));
    }, { once:true });
  } else if (selfV.src){
    const n = buildVideoTag(selfV);
    if (n) heroWrap.replaceChildren(n);
  } // else keep existing (image or fallback)

  renderTags(dom.article, post);

  dom.article.appendChild(
    el('p',{ class:'container' }, el('a',{ class:'btn btn-primary', href:'#/' }, 'Back to Posts'))
  );

  // Light embed hygiene
  for (const f of dom.body.querySelectorAll('iframe')){
    f.setAttribute('loading','lazy');
    f.setAttribute('referrerpolicy','no-referrer-when-downgrade');
    f.setAttribute('allow','accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    f.setAttribute('allowfullscreen','true');
  }
}

export async function renderPost(mount, id){
  renderSkeleton(mount);

  const hint = getPostHint(id);
  let dom = hint ? applyHint(mount, hint) : null;

  try{
    const post = await getPost(id);
    if (!dom){
      const title = decodeHTML(post?.title?.rendered || 'Untitled');
      const hero  = heroFrom(post);
      const article = el('article',{ class:'post container' },
        el('div',{ class:'post-hero' }, hero || el('div',{ class:'media-fallback' },'')),
        el('h1',{ class:'post-title' }, title),
        el('div',{ class:'meta' }, byline(post)),
      );
      mount.innerHTML=''; mount.appendChild(article);
      dom = { article, body: el('div',{ class:'post-body' }) };
      article.appendChild(dom.body);
    }
    renderFull(dom, post);
  }catch(e){
    console.warn('[OkObserver] renderPost failed:', e);
    mount.innerHTML = `
      <div class="container error">
        <p>Failed to load this article.</p>
        <p style="opacity:.8">${(e && e.message) ? e.message : e}</p>
        <p><a class="btn btn-primary" href="#/">Back to Posts</a></p>
      </div>`;
  }
}
/* 🔴 PostDetail.js */
