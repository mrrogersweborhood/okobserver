// PostDetail.js — v2025-10-30s (with unified apiFetch + offline dispatch)
import { apiFetch } from './api.js?v=2025-10-30s';

const API_BASE=(window&&window.API_BASE)||'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/';

export async function renderPost(mount,postId){
  mount.innerHTML=`
    <article class="post-detail fade-in">
      <div class="pd-media" aria-hidden="true"><div class="skeleton skeleton-media"></div></div>
      <header class="pd-header">
        <h1 class="pd-title skeleton skeleton-text skeleton-text-lg">&nbsp;</h1>
        <p class="pd-byline skeleton skeleton-text">&nbsp;</p>
      </header>
      <div class="pd-paywall-note" hidden></div>
      <section class="pd-content"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></section>
      <footer class="pd-footer"><a class="btn back-btn" href="#/">Back to Posts</a></footer>
      <section class="pd-tags" hidden></section>
    </article>`;

  try{
    const resp=await apiFetch(`posts/${encodeURIComponent(postId)}?_embed=1`);
    if(!resp.ok)throw new Error(`${resp.status}`);
    const post=await resp.json();

    const titleEl=mount.querySelector('.pd-title');
    const bylineEl=mount.querySelector('.pd-byline');
    titleEl.classList.remove('skeleton','skeleton-text','skeleton-text-lg');
    bylineEl.classList.remove('skeleton','skeleton-text');
    titleEl.innerHTML=post.title?.rendered||'Untitled';
    const author=(post._embedded?.author?.[0]?.name||'Oklahoma Observer');
    const date=new Date(post.date);
    const when=isFinite(date)?date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'';
    bylineEl.textContent=`${author}${when?' • '+when:''}`;

    const mediaBox=mount.querySelector('.pd-media');mediaBox.innerHTML='';
    const media=post._embedded?.['wp:featuredmedia']?.[0];
    if(media){
      const mime=media.media_type==='image'?(media.mime_type||'image/jpeg'):(media.mime_type||'');
      if(media.media_type==='image'){
        const src=media.source_url||media.media_details?.sizes?.large?.source_url||media.media_details?.sizes?.medium_large?.source_url||media.media_details?.sizes?.full?.source_url;
        if(src){const img=document.createElement('img');img.className='pd-hero';img.loading='lazy';img.decoding='async';img.alt=media.alt_text||'';img.src=src;mediaBox.appendChild(img);}
      }else if(mime.includes('video')||/mp4|webm|ogg/i.test(media.source_url||'')){
        const video=document.createElement('video');video.className='pd-hero-video';video.controls=true;video.preload='metadata';video.playsInline=true;
        const source=document.createElement('source');source.setAttribute('data-src',media.source_url);source.type=mime||'video/mp4';video.appendChild(source);
        mediaBox.appendChild(video);lazySrc(video);
      }
    }

    const contentBox=mount.querySelector('.pd-content');
    const paywallNote=mount.querySelector('.pd-paywall-note');
    if(post?.content?.protected){
      paywallNote.hidden=false;
      paywallNote.classList.add('wp-paywall');
      paywallNote.innerHTML=`<div class="wp-paywall-inner">${post.content?.rendered||''}</div>`;
      contentBox.innerHTML=post.excerpt?.rendered||'<p>(Summary unavailable.)</p>';
    }else{
      contentBox.innerHTML=sanitizeAllowBasic(post.content?.rendered||'');
      lazyEmbeds(contentBox);
    }

    const tagsBox=mount.querySelector('.pd-tags');
    try{
      if(Array.isArray(post.tags)&&post.tags.length){
        const tagResp=await apiFetch(`tags?include=${post.tags.join(',')}`);
        if(tagResp.ok){
          const tagData=await tagResp.json();
          if(Array.isArray(tagData)&&tagData.length){
            tagsBox.hidden=false;
            tagsBox.innerHTML=`
              <h3 class="pd-tags-title">Tags</h3>
              <ul class="pd-taglist">
                ${tagData.map(t=>`<li><a href="#/?tag=${t.id}" data-tag="${t.id}">#${escapeHTML(t.name)}</a></li>`).join('')}
              </ul>`;
          }
        }
      }
    }catch{}

    for(const s of mount.querySelectorAll('.skeleton'))s.remove();
  }catch(err){
    console.error('[OkObserver] renderPost failed:',err);
    window.dispatchEvent(new CustomEvent('okobserver:api-fail'));
    mount.innerHTML=`
      <div class="container error">
        <p>Something went wrong loading this view.</p>
        <pre>${escapeHTML(String(err.message||err))}</pre>
        <p><a class="btn back-btn" href="#/">Back to Posts</a></p>
      </div>`;
  }
}

function escapeHTML(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;');}
function sanitizeAllowBasic(html){
  html=html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,'');
  html=html.replace(/<img\b(?![^>]*\bloading=)/gi,'<img loading="lazy" decoding="async" ');
  html=html.replace(/<iframe\b(?![^>]*\bloading=)/gi,'<iframe loading="lazy" ');
  return html;
}
function lazySrc(videoEl){
  const io=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        const source=videoEl.querySelector('source[data-src]');
        if(source&&!source.src){source.src=source.getAttribute('data-src');videoEl.load();}
        io.disconnect();
      }
    });
  },{rootMargin:'200px'});
  io.observe(videoEl);
}
function lazyEmbeds(scope){
  const iframes=[...scope.querySelectorAll('iframe')];
  const videos=[...scope.querySelectorAll('video source')];
  iframes.forEach(f=>{if(!f.hasAttribute('data-src')&&f.src){f.setAttribute('data-src',f.src);f.removeAttribute('src');}});
  videos.forEach(s=>{if(!s.hasAttribute('data-src')&&s.src){s.setAttribute('data-src',s.src);s.removeAttribute('src');}});
  const io=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        const el=e.target;
        if(el.tagName==='IFRAME'&&el.dataset.src&&!el.src){el.src=el.dataset.src;}
        else if(el.tagName==='VIDEO'){const src=el.querySelector('source[data-src]');if(src&&!src.src){src.src=src.dataset.src;el.load();}}
        io.unobserve(el);
      }
    });
  },{rootMargin:'300px'});
  iframes.forEach(f=>io.observe(f));scope.querySelectorAll('video').forEach(v=>io.observe(v));
}
