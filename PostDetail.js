// PostDetail.js — v2025-10-31a
// - Uses resilient apiFetch (timeout + retry) from api.js
// - Renders WordPress HTML exactly as delivered (so paywall/login text shows as-is)
// - Handles featured image/video, responsive embeds, and well-formatted tag list
// - Small QoL: external links open in new tab; iframes lazy-load

import { el, decodeHTML, formatDate } from './util.js?v=2025-10-24e';
import { apiFetch, getImageCandidates } from './api.js?v=2025-10-31a';

function toText(html=''){ const d=document.createElement('div'); d.innerHTML=html; return (d.textContent||'').trim(); }

function hydrateLinksAndEmbeds(root){
  // Make <a> open in new tab (safer UX) and normalize rel
  root.querySelectorAll('a[href]').forEach(a=>{
    const url = a.getAttribute('href') || '';
    const isExternal = /^https?:\/\//i.test(url) && !url.includes(location.host);
    if (isExternal) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  });

  // Lazy iframes & responsive wrapper for common embeds (YouTube, Vimeo, etc.)
  root.querySelectorAll('iframe').forEach((ifr)=>{
    ifr.setAttribute('loading','lazy');
    // Wrap if not already wrapped
    if (!ifr.parentElement.classList.contains('embed-responsive')) {
      const wrap = document.createElement('div');
      wrap.className = 'embed-responsive';
      // 16:9 by default; if height/width present, compute ratio
      const w = parseInt(ifr.getAttribute('width')||'16',10);
      const h = parseInt(ifr.getAttribute('height')||'9',10);
      const ratio = h>0 && w>0 ? (h/w*100) : 56.25;
      wrap.style.position='relative';
      wrap.style.width='100%';
      wrap.style.paddingTop = ratio.toFixed(3)+'%';
      ifr.style.position='absolute';
      ifr.style.inset='0';
      ifr.style.width='100%';
      ifr.style.height='100%';
      ifr.style.border='0';
      ifr.parentElement.insertBefore(wrap, ifr);
      wrap.appendChild(ifr);
    }
  });
}

function renderTags(block, post){
  try{
    const terms = post?._embedded?.['wp:term'];
    if (!Array.isArray(terms)) return;
    const tags = [];
    for (const group of terms){
      for (const t of (group||[])){
        if ((t?.taxonomy||'').toLowerCase() === 'post_tag' && t?.name) {
          tags.push({ name: t.name, slug: t.slug });
        }
      }
    }
    if (!tags.length) return;

    const ul = el('ul', { class: 'tags' },
      ...tags.slice(0, 30).map(t =>
        el('li', null,
          el('a', { href: `https://okobserver.org/tag/${encodeURIComponent(t.slug)}/`, target: '_blank', rel: 'noopener' }, `#${t.name}`)
        )
      )
    );
    block.appendChild(el('h4', { class: 'tags-title' }, 'Tags'));
    block.appendChild(ul);
  }catch{}
}

function heroBlock(post){
  const img = getImageCandidates(post);
  if (!img.src) return null;
  return el('figure', { class: 'post-hero' },
    el('img', {
      src: img.src,
      srcset: img.srcset || undefined,
      sizes: img.sizes || undefined,
      alt: decodeHTML(post?.title?.rendered || 'Featured image'),
      loading: 'eager',
      decoding: 'async',
      style: 'display:block;width:100%;max-height:520px;object-fit:contain;background:#000;'
    })
  );
}

function note(msg){
  return el('div', { class: 'notice', style: 'background:#F3F4F6;border:1px solid #E5E7EB;border-radius:10px;padding:.9rem 1rem;margin:.75rem 0;color:#374151' }, msg);
}

export async function renderPost(mount, id){
  mount.innerHTML = '';
  const container = el('article', { class: 'post container' });
  mount.appendChild(container);

  // header shell
  const titleEl = el('h1', { class: 'post-title' }, '');
  const metaEl  = el('div', { class: 'post-meta' }, '');
  const heroEl  = el('div', { class: 'post-hero-wrap' });
  const bodyEl  = el('div', { class: 'post-body' });
  const tagsEl  = el('div', { class: 'post-tags-wrap' });

  container.append(titleEl, metaEl, heroEl, bodyEl, tagsEl);

  // fetch post
  let post;
  try{
    const resp = await apiFetch(`posts/${encodeURIComponent(id)}?_embed=1`);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    post = await resp.json();
  }catch(e){
    mount.prepend(
      note('Something went wrong loading this view.')
    );
    container.appendChild(
      el('p', null, String(e && e.message ? e.message : 'Failed to fetch'))
    );
    container.appendChild(
      el('p', null, el('a', { href: '#/' }, 'Back to Posts'))
    );
    return;
  }

  // populate header
  const title = decodeHTML(post?.title?.rendered || 'Untitled');
  titleEl.textContent = title;
  const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  metaEl.textContent = `${author} • ${formatDate(post?.date)}`;

  // hero (image) if present
  const hero = heroBlock(post);
  if (hero) heroEl.appendChild(hero);

  // WordPress HTML (includes videos/paywall text when protected)
  // We render EXACTLY what WP gives us so the original login/subscribe paragraph shows.
  const html = String(post?.content?.rendered || post?.excerpt?.rendered || '');
  if (!html) {
    bodyEl.appendChild(note('This article has no body content in the public API.'));
  } else {
    bodyEl.innerHTML = html;
    hydrateLinksAndEmbeds(bodyEl);
  }

  // Tag list
  renderTags(tagsEl, post);

  // Back button at bottom
  container.appendChild(
    el('p', { style: 'margin:2rem 0' }, el('a', { href: '#/', class: 'btn-back' }, 'Back to Posts'))
  );

  // Minimal inline styles to ensure clean layout without touching your CSS files
  const style = document.createElement('style');
  style.textContent = `
    .post.container{max-width:980px;margin:0 auto;padding:1.2rem}
    .post-title{font-size:clamp(1.6rem,2.2vw,2.2rem);line-height:1.25;margin:.4rem 0 .6rem}
    .post-meta{color:#6B7280;margin-bottom:1rem}
    .post-hero{margin:0 0 1rem 0}
    .embed-responsive{background:#000;border-radius:10px;overflow:hidden;margin:.75rem 0}
    .notice a{color:#1E90FF}
    .tags{display:flex;flex-wrap:wrap;gap:.5rem;margin:.5rem 0 1.5rem;padding:0;list-style:none}
    .tags-title{margin:1.5rem 0 .25rem}
    .tags li a{display:inline-block;padding:.25rem .55rem;border:1px solid #E5E7EB;border-radius:999px;color:#374151;text-decoration:none}
    .tags li a:hover{border-color:#CBD5E1}
    .btn-back{display:inline-block;background:#1E90FF;color:#fff;padding:.55rem .9rem;border-radius:10px;text-decoration:none}
    .btn-back:hover{filter:brightness(.95)}
  `;
  document.head.appendChild(style);
}
