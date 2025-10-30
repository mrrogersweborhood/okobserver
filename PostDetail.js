// PostDetail.js — v2025-10-30e
// Display WordPress-rendered HTML exactly as delivered (including paywall/login messages)

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPost, getImageCandidates, getPostHint } from './api.js?v=2025-10-28i';

const IFRAME_TIMEOUT_MS = 2500;

function byline(post){
  const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date = formatDate(post.date);
  return `${author} • ${date}`;
}

function firstIframeSrc(html=''){
  try {
    const d=document.createElement('div'); d.innerHTML=html;
    const f=d.querySelector('iframe[src]');
    return f?f.getAttribute('src'):'';
  }catch{return '';}
}

function selfHostedVideo(post){
  try{
    const media=post?._embedded?.['wp:featuredmedia']?.[0];
    const mt=media?.mime_type||'';
    if(mt.startsWith('video/')){
      const src=media?.source_url||'';
      const s=media?.media_details?.sizes||{};
      const poster=(s.medium_large||s.large||s.full)?.source_url||'';
      return {src,poster};
    }
  }catch{}
  return {src:'',poster:''};
}

function imageHero(post,{alt='Featured image'}={}){
  const img=getImageCandidates(post);
  if(!img.src)return null;
  return el('img',{
    src:img.src, srcset:img.srcset||undefined, sizes:img.sizes||undefined,
    alt, loading:'eager', decoding:'async', fetchpriority:'high'
  });
}

function buildIframe(src,onReady,onTimeout){
  const iframe=el('iframe',{
    src,
    loading:'lazy',
    allow:'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    allowfullscreen:'true',
    referrerpolicy:'no-referrer-when-downgrade',
    frameborder:'0'
  });
  let done=false;
  const timer=setTimeout(()=>{if(!done){done=true;onTimeout?.();}},IFRAME_TIMEOUT_MS);
  iframe.addEventListener('load',()=>{if(!done){done=true;clearTimeout(timer);onReady?.(iframe);}}, {once:true});
  return iframe;
}

function renderTags(article,post){
  const groups=post?._embedded?.['wp:term']||[];
  const tags=[];
  for(const g of groups)for(const t of g||[]){if(t.taxonomy==='post_tag')tags.push(t.name);}
  if(!tags.length)return;
  const list=el('ul',{class:'tag-list'},...tags.map(n=>el('li',{},el('span',{class:'tag-pill'},`#${decodeHTML(n)}`))));
  article.appendChild(el('div',{class:'post-tags container'},el('h4',{class:'tag-title'},'Tags'),list));
}

function renderFull(dom,post){
  const title=decodeHTML(post?.title?.rendered||'Untitled');
  const contentHTML=post?.content?.rendered||'';
  const excerptHTML=post?.excerpt?.rendered||'';
  const htmlToUse = contentHTML.trim() ? contentHTML : (excerptHTML.trim() ? excerptHTML : '<p>Post unavailable.</p>');
  dom.body.innerHTML=`<div class="post-content">${htmlToUse}</div>`;

  const heroWrap=dom.article.querySelector('.post-hero');
  const embed=firstIframeSrc(contentHTML);
  const selfV=selfHostedVideo(post);

  if(embed){
    const iframe=buildIframe(embed,
      (loaded)=>heroWrap.replaceChildren(el('div',{class:'video-wrapper'},loaded)),
      ()=>{}
    );
    heroWrap.appendChild(iframe);
  } else if(selfV.src){
    const v=el('video',{controls:true,playsinline:true,preload:'metadata',poster:selfV.poster||undefined},
      el('source',{src:selfV.src,type:'video/mp4'})
    );
    heroWrap.replaceChildren(el('div',{class:'video-wrapper'},v));
  }

  renderTags(dom.article,post);

  dom.article.appendChild(el('p',{class:'container'},el('a',{class:'btn btn-primary',href:'#/'},'Back to Posts')));

  for(const f of dom.body.querySelectorAll('iframe')){
    f.setAttribute('loading','lazy');
    f.setAttribute('allowfullscreen','true');
  }
}

export async function renderPost(mount,id){
  mount.innerHTML=`<article class="post container"><div class="skeleton hero"></div><h1 class="skeleton title"></h1></article>`;
  const hint=getPostHint(id);
  let dom;
  if(hint){
    const title=decodeHTML(hint?.title?.rendered||'Untitled');
    const hero=imageHero(hint,{alt:title});
    const article=el('article',{class:'post container'},
      el('div',{class:'post-hero'},hero||el('div',{class:'media-fallback'},'')),
      el('h1',{class:'post-title'},title),
      el('div',{class:'meta'},byline(hint))
    );
    mount.innerHTML='';mount.appendChild(article);
    dom={article,body:el('div',{class:'post-body'})};
    article.appendChild(dom.body);
  }

  try{
    const post=await getPost(id);
    if(!dom){
      const title=decodeHTML(post?.title?.rendered||'Untitled');
      const hero=imageHero(post,{alt:title});
      const article=el('article',{class:'post container'},
        el('div',{class:'post-hero'},hero||el('div',{class:'media-fallback'},'')),
        el('h1',{class:'post-title'},title),
        el('div',{class:'meta'},byline(post))
      );
      mount.innerHTML='';mount.appendChild(article);
      dom={article,body:el('div',{class:'post-body'})};
      article.appendChild(dom.body);
    }
    renderFull(dom,post);
  }catch(e){
    mount.innerHTML=`<div class="container error"><p>Failed to load article.</p><p>${e.message||e}</p></div>`;
  }
}
