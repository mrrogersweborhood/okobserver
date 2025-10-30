// PostDetail.js — v2025-10-30b
// Bullet-proof media rendering: poster-first, upgrade-on-load, graceful fallback.
// Friendly protected/teaser note + link. Tag pills + single Back button kept.

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPost, getImageCandidates, getPostHint } from './api.js?v=2025-10-28i';

const IFRAME_TIMEOUT_MS = 2500; // shorter = less chance of black box

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

function imageHero(post, { alt='Featured image' } = {}){
  const img = getImageCandidates(post);
  if(!img.src) return null;
  return el('img',{
    src:img.src, srcset:img.srcset||undefined, sizes:img.sizes||undefined,
    width:img.width||undefined, height:img.height||undefined,
    alt, loading:'eager', decoding:'async', fetchpriority:'high'
  });
}

/* ---------- Poster-first strategy ---------- */

function posterBlock(src, clickHref = '', title = 'Play') {
  const img = el('img', { src, alt: title, loading: 'eager', decoding: 'async' });
  const btn = el('button', { class: 'play-overlay', 'aria-label': 'Play video' });
  const block = el('div', { class: 'hero-media is-image' }, img, btn);
  if (clickHref) block.addEventListener('click', () => window.open(clickHref, '_blank', 'noopener'));
  return block;
}

function buildIframe(src, onReady, onTimeout) {
  const iframe = el('iframe', {
    src,
    loading: 'lazy',
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    allowfullscreen: 'true',
    referrerpolicy: 'no-referrer-when-downgrade',
    frameborder: '0'
  });
  let done = false;
  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    onTimeout?.();
  }, IFRAME_TIMEOUT_MS);

  iframe.addEventListener('load', () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    onReady?.(iframe);
  }, { once: true });

  return iframe;
}

/* ---------- Tags ---------- */

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

/* ---------- Skeleton & Hint ---------- */

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

function buildSafeHeroFrom(post){
  const title = decodeHTML(post?.title?.rendered || 'Untitled');
  const html  = post?.content?.rendered || post?.excerpt?.rendered || '';
  const embed = firstIframeSrc(html);
  const selfV = selfHostedVideo(post);

  // Prefer embed (YouTube/Vimeo). Poster-first; upgrade after iframe load.
  if (embed){
    const poster = youTubeThumb(embed) || getImageCandidates(post).src || '';
    return poster ? posterBlock(poster, embed, title) : imageHero(post, { alt: title });
  }
  // Self-hosted <video> (rare): use native player
  if (selfV.src){
    const v = el('video',{ controls:true, playsinline:true, preload:'metadata', poster:selfV.poster||undefined },
      el('source',{ src:selfV.src, type:'video/mp4' })
    );
    return el('div',{ class:'video-wrapper' }, v);
  }
  return imageHero(post, { alt: title });
}

function applyHint(mount, hint){
  const title = decodeHTML(hint?.title?.rendered || 'Untitled');
  const hero  = buildSafeHeroFrom(hint);
  const article = el('article',{ class:'post container' },
    el('div',{ class:'post-hero' }, hero || el('div',{ class:'media-fallback' },'')),
    el('h1',{ class:'post-title' }, title),
    el('div',{ class:'meta' }, byline(hint)),
  );
  mount.innerHTML=''; mount.appendChild(article);
  const body = el('div',{ class:'post-body' }); article.appendChild(body);
  return { article, body };
}

/* ---------- Full render ---------- */

function renderFull(dom, post){
  const title = decodeHTML(post?.title?.rendered || 'Untitled');
  const contentHTML = post?.content?.rendered || '';
  const excerptHTML = post?.excerpt?.rendered || '';
  const isProtected = !!post?.content?.protected || !contentHTML || !contentHTML.trim();
  const permalink = post?.link || `https://okobserver.org/?p=${post?.id || ''}`;

  // Body
  const htmlToUse = (!isProtected)
    ? contentHTML
    : `
      <div class="paywall-note">
        <em>This article’s full text isn’t available via the public API.</em>
        &nbsp;<a href="${permalink}" target="_blank" rel="noopener">Read on okobserver.org</a>.
      </div>
      ${excerptHTML || ''}`;
  dom.body.innerHTML = `<div class="post-content">${htmlToUse}</div>`;

  // Upgrade hero with *real* iframe only after it loads; until then keep poster
  const heroWrap = dom.article.querySelector('.post-hero');
  const currentPoster = heroWrap.querySelector('img');

  const embed = firstIframeSrc(contentHTML);
  const selfV = selfHostedVideo(post);

  if (embed){
    const iframe = buildIframe(
      embed,
      // onReady -> replace poster with loaded iframe
      (loaded) => {
        const wrap = el('div',{ class:'video-wrapper' }, loaded);
        heroWrap.replaceChildren(wrap);
      },
      // onTimeout -> keep poster; clicking opens provider in new tab
      () => {
        if (currentPoster) {
          heroWrap.replaceChildren(posterBlock(currentPoster.src, embed, title));
        }
      }
    );
    // Begin load attempt, but don't swap DOM until onReady fires
    // (we leave the poster visible meanwhile)
    // no-op here; the act of creating the iframe starts the load
  } else if (selfV.src){
    const v = el('video',{ controls:true, playsinline:true, preload:'metadata', poster:selfV.poster||undefined },
      el('source',{ src:selfV.src, type:'video/mp4' })
    );
    heroWrap.replaceChildren(el('div',{ class:'video-wrapper' }, v));
  }

  renderTags(dom.article, post);

  dom.article.appendChild(
    el('p',{ class:'container' }, el('a',{ class:'btn btn-primary', href:'#/' }, 'Back to Posts'))
  );

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
      const hero  = buildSafeHeroFrom(post);
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
