// detail.js — post detail renderer with hero image / poster fallback
// v2.5.5
import { fetchPostById, pickFeaturedImage } from './api.js';

const YT = /(?:youtube\.com|youtu\.be)/i;
const VM = /vimeo\.com/i;
const FB = /facebook\.com/i;
const ALWAYS_POSTER_HOSTS = /(facebook\.com)/i; // poster-first for FB (iframes often blocked)

function decodeHTML(str='') {
  const d = document.createElement('textarea');
  d.innerHTML = str; return d.value;
}

function firstMediaLinkFromContent(html='') {
  // Look for <a href="..."> that points to YT/Vimeo/FB
  const div = document.createElement('div');
  div.innerHTML = html;
  const as = Array.from(div.querySelectorAll('a[href]'));
  const hit = as.find(a => YT.test(a.href) || VM.test(a.href) || FB.test(a.href));
  return hit?.href || '';
}

function posterFromFeaturedOrContent(post) {
  const hero = pickFeaturedImage(post);
  if (hero) return hero;
  // fallback: first <img> inside content
  const div = document.createElement('div');
  div.innerHTML = post?.content?.rendered || '';
  const img = div.querySelector('img[src]');
  return img?.src || '';
}

function heroPosterBlock({poster, clickUrl}) {
  if (!poster) return '';
  const clickAttr = clickUrl ? ` data-click="${encodeURIComponent(clickUrl)}"` : '';
  return `
    <div class="hero-wrap">
      <img class="hero${clickUrl ? ' is-clickable' : ''}" src="${poster}" alt=""${clickAttr} />
    </div>
  `;
}

function bindHeroClick(container) {
  const img = container.querySelector('.hero.is-clickable');
  if (img) {
    img.addEventListener('click', (e)=>{
      const target = img.getAttribute('data-click');
      if (target) {
        const url = decodeURIComponent(target);
        window.open(url, '_blank', 'noopener');
      }
    });
  }
}

export async function renderPost(id) {
  const app = document.getElementById('app');
  if (!app) return;

  // Skeleton
  app.innerHTML = `
    <div class="post-wrap">
      <div class="back-row"><a class="back-btn" href="#/">← Back to posts</a></div>
      <article class="post">
        <div class="hero-slot"></div>
        <h1 class="post-title"></h1>
        <div class="meta"></div>
        <div class="post-content"></div>
      </article>
    </div>
  `;

  const heroSlot = app.querySelector('.hero-slot');
  const titleEl  = app.querySelector('.post-title');
  const metaEl   = app.querySelector('.meta');
  const bodyEl   = app.querySelector('.post-content');

  try {
    const post = await fetchPostById(id);
    const title = decodeHTML(post?.title?.rendered || '');
    const author = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
    const when = new Date(post?.date || Date.now());
    const niceDate = when.toLocaleDateString(undefined, {year:'numeric', month:'long', day:'numeric'});

    // Title + meta
    titleEl.textContent = title;
    metaEl.textContent  = `${author} — ${niceDate}`;

    // Hero: prefer poster when FB; else render poster if iframe likely blocked or absent
    const mediaLink = firstMediaLinkFromContent(post?.content?.rendered || '');
    const poster = posterFromFeaturedOrContent(post);

    let heroHTML = '';
    if (mediaLink && ALWAYS_POSTER_HOSTS.test(mediaLink)) {
      // Facebook: show poster clickable to open new tab
      heroHTML = heroPosterBlock({poster, clickUrl: mediaLink});
    } else {
      // Non-FB: if we have a featured image, show it; if we also have a media link,
      // make the image clickable to open the video
      heroHTML = heroPosterBlock({poster, clickUrl: mediaLink || ''});
    }
    heroSlot.innerHTML = heroHTML;
    bindHeroClick(app);

    // Body (safety tweaks: remove first-paragraph text-indent; media responsiveness)
    const contentHTML = (post?.content?.rendered || '')
      .replace(/text-indent:\s*2em/gi, 'text-indent:0')  // kill inline indent hacks from WP
      .replace(/<iframe /gi, '<iframe loading="lazy" ')
      .replace(/<img /gi, '<img loading="lazy" style="max-width:100%;height:auto" ');

    bodyEl.innerHTML = contentHTML;

  } catch (e) {
    console.error('[OkObserver] detail load failed:', e);
    const status = (e && typeof e === 'object' && 'status' in e) ? e.status : 0;
    app.innerHTML = `
      <div class="post-wrap">
        <div class="back-row"><a class="back-btn" href="#/">← Back to posts</a></div>
        <article class="post">
          <h1 class="post-title">Post not found</h1>
          <p>Sorry, we couldn't load this post.${status ? ` <small>(status ${status})</small>` : ''}</p>
        </article>
      </div>
    `;
  }
}
