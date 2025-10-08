// home.js — summary grid with author + featured images + infinite scroll
import {
  fetchLeanPostsPage,
  getFeaturedImage,
  resolveFeaturedImage,
  getAuthorName,
  getCartoonCategoryId,
  fetchAuthorsMap,
  PER_PAGE
} from './api.js';

const app = () => document.getElementById('app');
const SEEN = new Set();

function decodeHtml(s=''){ const t=document.createElement('textarea'); t.innerHTML=s; return t.value; }
function formatDate(iso){ if(!iso) return ''; const d=new Date(iso);
  const day=d.getDate(), ord=(n)=>{const j=n%10,k=n%100; if(j===1&&k!==11)return n+'st'; if(j===2&&k!==12)return n+'nd'; if(j===3&&k!==13)return n+'rd'; return n+'th';};
  return d.toLocaleString('en-US',{month:'long'})+' '+ord(day)+', '+d.getFullYear();
}

function makeCard(post, authorMap){
  const pid   = String(post.id);
  const title = decodeHtml(post?.title?.rendered || '');
  const author= getAuthorName(post, authorMap);
  const date  = formatDate(post?.date);

  const img = document.createElement('img');
  img.className = 'thumb';
  img.alt = title || 'featured image';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.style.visibility = 'hidden';
  img.setAttribute('aria-hidden','true');

  const embedded = getFeaturedImage(post);
  const reveal = (src)=>{
    if (!src) { img.remove(); return; }
    img.src = src;
    img.onload = ()=>{ img.style.visibility='visible'; img.removeAttribute('aria-hidden'); };
    img.onerror = ()=>{ img.remove(); };
  };
  if (embedded) reveal(embedded); else resolveFeaturedImage(post).then(reveal).catch(()=>img.remove());

  const card = document.createElement('article');
  card.className = 'card';

  const link = document.createElement('a');
  link.href = `#/post/${pid}`;
  link.addEventListener('click', () => {
    try { sessionStorage.setItem('__oko_scroll__', String(window.scrollY || 0)); } catch {}
  });
  link.appendChild(img);

  const body = document.createElement('div');
  body.className = 'card-body';

  const h2 = document.createElement('h2'); h2.className='title';
  const a  = document.createElement('a'); a.href = `#/post/${pid}`; a.textContent = title || 'Untitled';
  a.addEventListener('click', () => {
    try { sessionStorage.setItem('__oko_scroll__', String(window.scrollY || 0)); } catch {}
  });
  h2.appendChild(a);

  const meta = document.createElement('div'); meta.className='meta'; meta.textContent = `${author} — ${date}`;

  const excerpt = document.createElement('div'); excerpt.className='excerpt';
  excerpt.innerHTML = decodeHtml(post?.excerpt?.rendered || '');

  body.append(h2, meta, excerpt);
  card.append(link, body);
  return card;
}

export async function renderHome({ force=false } = {}){
  const host = app(); if (!host) return;

  // Clear and rebuild so Back always shows fresh grid
  host.innerHTML = '';
  const grid = document.createElement('div'); grid.className='grid';
  host.appendChild(grid);

  // Ensure we know cartoon id before first page
  const ctrl = new AbortController();
  try { await getCartoonCategoryId(ctrl.signal); } catch {}

  let page = 1;

  async function loadPage(){
    const posts = await fetchLeanPostsPage(page, { excludeCartoon: true }, ctrl.signal);

    // Build author fallback map if any post lacks embedded author
    const needs = [];
    for (const p of posts){
      const hasEmbedded = !!(p?._embedded?.author?.[0]?.name);
      if (!hasEmbedded && p?.author != null) needs.push(Number(p.author));
    }
    let authorMap = {};
    if (needs.length){
      try { authorMap = await fetchAuthorsMap(needs, ctrl.signal); } catch {}
    }

    for (const p of posts){
      if (SEEN.has(p.id)) continue;
      SEEN.add(p.id);
      grid.appendChild(makeCard(p, authorMap));
    }
    page++;
  }

  await loadPage();

  // Infinite scroll sentinel
  const sentinel = document.createElement('div'); sentinel.style.height='1px'; host.appendChild(sentinel);
  const io = new IntersectionObserver(async (ents)=>{
    for (const e of ents){ if (e.isIntersecting){ try{ await loadPage(); }catch{} } }
  }, { rootMargin: '900px 0px' });
  io.observe(sentinel);
}
