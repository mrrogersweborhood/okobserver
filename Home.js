// Home.js — v2025-10-28f (throttled prefetch scheduler)

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { getPosts, getImageCandidates, isCartoon, seedPostHint, prefetchPost } from './api.js?v=2025-10-28i';

function toText(html=''){const d=document.createElement('div');d.innerHTML=html;return(d.textContent||'').trim();}
function clamp(s='',n=220){return s.length<=n?s:s.slice(0,n-1).trimEnd()+'…';}

// ----- Prefetch scheduler (1-at-a-time, cancelable) -----
const queued = new Set();
let running = false;
function canPrefetchNow(){
  const c = navigator.connection;
  if (!c) return true;
  if (c.saveData) return false;
  const slow = ['slow-2g','2g'];
  return !slow.includes(c.effectiveType || '');
}
async function runQueue(){
  if (running) return;
  running = true;
  while (queued.size) {
    const id = queued.values().next().value;
    queued.delete(id);
    if (!canPrefetchNow()) break;
    try { await prefetchPost(id); } catch {}
  }
  running = false;
}
function schedulePrefetch(id){
  if (!canPrefetchNow()) return;
  queued.add(id);
  runQueue();
}

function installPrefetchTriggers(cardEl, postId, ioLimiter){
  let hoverTimer=null, touched=false, warmed=false;
  const warm=()=>{ if(!warmed){ warmed=true; schedulePrefetch(postId); } };
  const onEnter=()=>{ hoverTimer=setTimeout(warm,120); };
  const onLeave=()=>{ if(hoverTimer){ clearTimeout(hoverTimer); hoverTimer=null; } };
  cardEl.addEventListener('mouseenter', onEnter, {passive:true});
  cardEl.addEventListener('mouseleave', onLeave, {passive:true});
  cardEl.addEventListener('touchstart', ()=>{ if(!touched){ touched=true; warm(); } }, {passive:true});

  // Viewport proximity (only nearest N via ioLimiter)
  ioLimiter.observe(cardEl, warm);
}

// limit IO prefetch to the closest N cards
function makeIOLimiter(N=6, rootMargin='200px'){
  let count=0;
  const seen = new WeakSet();
  const io = new IntersectionObserver((ents, obs)=>{
    ents.forEach(e=>{
      if (count>=N) return;
      if (e.isIntersecting && !seen.has(e.target)) {
        seen.add(e.target);
        count++;
        const fn = callbacks.get(e.target);
        if (fn) fn();
      }
    });
  }, { rootMargin, threshold: 0.01 });

  const callbacks = new Map();
  return {
    observe(el, cb){ callbacks.set(el, cb); io.observe(el); },
    disconnect(){ io.disconnect(); callbacks.clear(); }
  };
}

function createPostCard(post, idx=0, ioLimiter){
  seedPostHint(post); // for instant paint on detail

  const href   = `#/post/${post.id}`;
  const title  = decodeHTML(post.title?.rendered || 'Untitled');
  const date   = formatDate(post.date);
  const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const excerpt= clamp(toText(post.excerpt?.rendered || post.content?.rendered || ''));

  const img = getImageCandidates(post);
  const mediaEl = img.src
    ? el('img',{src:img.src,srcset:img.srcset||undefined,sizes:img.sizes||undefined,width:img.width||undefined,height:img.height||undefined,alt:title,loading:'lazy',decoding:'async',fetchpriority: idx<4?'high':'low'})
    : el('div',{class:'media-fallback'},'No image');

  const card = el('article',{class:'card'},
    el('a',{href, class:'card-media'}, mediaEl),
    el('div',{class:'card-body'},
      el('h3',{class:'card-title'}, el('a',{href}, title)),
      el('div',{class:'meta'}, `${author} • ${date}`),
      excerpt ? el('p',{class:'post-excerpt'}, excerpt) : null
    )
  );

  installPrefetchTriggers(card, post.id, ioLimiter);
  return card;
}

const HOME_STATE_KEY='okobserver.home.state.v1';
const readState=()=>{try{const r=sessionStorage.getItem(HOME_STATE_KEY);const o=r&&JSON.parse(r);if(o&&o.page>0&&Array.isArray(o.ids)&&o.ids.length)return o;}catch{}return null;};
const writeState=(s)=>{try{sessionStorage.setItem(HOME_STATE_KEY,JSON.stringify(s));}catch{}};
const clearState=()=>{try{sessionStorage.removeItem(HOME_STATE_KEY);}catch{}};

export async function renderHome(mount){
  mount.innerHTML='';
  const grid=el('section',{class:'post-grid container'});
  mount.appendChild(grid);

  let page=1,loading=false,done=false,observer=null;
  const renderedIds=new Set();
  let totalRendered=0,hasRenderedAny=false;

  const saved=readState(); if(!saved) clearState();
  const saveStateIfReady=()=>{ if(hasRenderedAny) writeState({page,scrollY:window.scrollY,ids:Array.from(renderedIds)}); };
  mount.addEventListener('click',e=>{ const a=e.target?.closest?.('a[href^="#/post/"]'); if(a) saveStateIfReady(); });

  const ioLimiter = makeIOLimiter(6, '200px');

  async function loadPage(){
    if (loading||done) return;
    loading=true;
    try{
      const posts=await getPosts({page,per_page:12});
      if(!Array.isArray(posts)||!posts.length){
        done=true; if(observer) observer.disconnect();
        appendEndCap(totalRendered===0?'No posts found.':'No more posts.'); return;
      }
      const filtered=posts.filter(p=>!renderedIds.has(p.id)&&!isCartoon(p));

      const frag=document.createDocumentFragment();
      filtered.forEach((p,i)=>{
        renderedIds.add(p.id);
        frag.appendChild(createPostCard(p,i,ioLimiter));
      });
      if(filtered.length){
        await new Promise(requestAnimationFrame);
        grid.appendChild(frag);
        totalRendered+=filtered.length;
        hasRenderedAny=true;
      }
      page++;

      // idle warm next page list (cheap; improves scroll)
      const prefetch=()=>getPosts({page,per_page:12}).catch(()=>{});
      if('requestIdleCallback' in window) requestIdleCallback(prefetch,{timeout:1500});
      else setTimeout(prefetch,600);
    }catch(e){
      console.warn('[OkObserver] Home load failed:',e);
      showError('Network error while loading posts. Please retry.');
      done=true;
    }finally{ loading=false; }
  }

  function showError(text){ mount.prepend(el('div',{class:'container error',style:'color:#b91c1c'},text)); }
  function appendEndCap(msg){ if(mount.querySelector('#end-cap')) return; mount.appendChild(el('div',{id:'end-cap',class:'end-cap'},msg)); }

  clearState();
  await loadPage();
  if (totalRendered<6) await loadPage();

  const sentinel=el('div',{id:'scroll-sentinel',style:'height:40px'}); mount.appendChild(sentinel);
  observer=new IntersectionObserver(ents=>ents.some(e=>e.isIntersecting)&&loadPage(),{rootMargin:'800px 0px',threshold:0});
  observer.observe(sentinel);

  if(saved?.scrollY!=null) requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,Math.max(0,saved.scrollY))));

  window.addEventListener('pagehide',   saveStateIfReady,{once:true});
  window.addEventListener('beforeunload', saveStateIfReady,{once:true});
}
