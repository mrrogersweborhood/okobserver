// home.js — summary grid with author + featured image + infinite scroll (no logo flash)
import { fetchLeanPostsPage, getFeaturedImage, resolveFeaturedImage, getAuthorName } from './api.js';
import { createEl, decodeEntities, ordinalDate } from './shared.js';

const app = () => document.getElementById('app');
const SEEN = new Set();

function makeCard(post){
  const pid   = String(post.id);
  const title = decodeEntities(post?.title?.rendered || '');
  const author= getAuthorName(post);
  const date  = ordinalDate(post?.date);

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
  link.appendChild(img);

  const body = document.createElement('div');
  body.className = 'card-body';

  const h2 = document.createElement('h2'); h2.className='title';
  const a  = document.createElement('a'); a.href = `#/post/${pid}`; a.textContent = title || 'Untitled';
  h2.appendChild(a);

  const meta = document.createElement('div'); meta.className='meta'; meta.textContent = `${author} — ${date}`;

  const excerpt = document.createElement('div'); excerpt.className='excerpt';
  excerpt.innerHTML = decodeEntities(post?.excerpt?.rendered || '');

  body.append(h2, meta, excerpt);
  card.append(link, body);
  return card;
}

export async function renderHome(){
  const host = app(); if (!host) return;
  const grid = document.createElement('div'); grid.className='grid';
  host.innerHTML = ''; host.appendChild(grid);

  let page = 1;
  async function loadPage(){
    const posts = await fetchLeanPostsPage(page, { excludeCartoon: true });
    for (const p of posts){ if (SEEN.has(p.id)) continue; SEEN.add(p.id); grid.appendChild(makeCard(p)); }
    page++;
  }
  await loadPage();

  const sentinel = document.createElement('div'); sentinel.style.height='1px'; host.appendChild(sentinel);
  const io = new IntersectionObserver(async (ents)=>{
    for (const e of ents){ if (e.isIntersecting){ try{ await loadPage(); }catch{} } }
  }, { rootMargin: '800px 0px' });
  io.observe(sentinel);
}
