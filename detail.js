// OkObserver — Post detail view (safe, self-contained, non-breaking)

const API_BASE = (window && window.API_BASE) || 'api/wp/v2';

// Simple storage keys for scroll return
const SCROLL_KEY = 'route:/:scrollY';
function saveScroll() {
  try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0)); } catch(_) {}
}
function restoreScroll() {
  try {
    const y = parseInt(sessionStorage.getItem(SCROLL_KEY) || '0', 10);
    if (!Number.isNaN(y)) window.scrollTo(0, y);
  } catch(_) {}
}

// Tiny DOM helpers
function el(tag, opts = {}, children = []) {
  // null-safe options/children
  opts = opts || {}; if (children == null) children = [];
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.attrs) Object.entries(opts.attrs).forEach(([k,v]) => node.setAttribute(k, v));
  if (!Array.isArray(children)) children = [children];
  children.forEach(c => {
    if (c == null) return;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  });
  return node;
}
function stripHtml(html) {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

/* -------------------------
   API
-------------------------- */
async function apiFetchJson(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API Error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchPost(id) {
  const fields =
    'id,date,content.rendered,title.rendered,excerpt.rendered,author,featured_media,' +
    '_embedded.author.name,_embedded.wp:featuredmedia.source_url,' +
    '_embedded.wp:featuredmedia.media_details.sizes';
  const url = `${API_BASE}/posts/${encodeURIComponent(id)}?_embed=1&_fields=${encodeURIComponent(fields)}`;
  return apiFetchJson(url);
}

function selectHero(post) {
  try {
    const media = post?._embedded?.['wp:featuredmedia'];
    if (media && media[0]) {
      const sizes = media[0]?.media_details?.sizes || {};
      return (
        sizes.large?.source_url ||
        sizes.medium_large?.source_url ||
        sizes.medium?.source_url ||
        media[0].source_url ||
        ''
      );
    }
  } catch(_) {}
  return '';
}

/* -------------------------
   Embed hygiene (YouTube/Vimeo/Facebook)
-------------------------- */

// Derive a YouTube poster from iframe src if possible
function youtubePosterFromSrc(src) {
  // grabs v=ID or youtu.be/ID or /embed/ID
  const m =
    /(?:v=|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{6,})/.exec(src || '');
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : '';
}

function wrapIframesResponsively(root) {
  const iframes = root.querySelectorAll('iframe');
  if (!iframes.length) return;

  iframes.forEach(iframe => {
    // Already wrapped?
    if (iframe.parentElement?.classList.contains('video-wrap')) return;

    const src = iframe.getAttribute('src') || '';
    const host = (() => {
      try { return new URL(src, location.href).hostname; } catch { return ''; }
    })();

    // Generic responsive wrapper (prevents "giant white space")
    const shell = el('div', { className: 'video-wrap' });
    const inner = el('div', { className: 'video-inner' });
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');

    // YouTube: replace with poster that opens the video in a new tab (lightweight & reliable)
    if (/youtube\.com|youtu\.be/.test(host)) {
      const poster = youtubePosterFromSrc(src);
      if (poster) {
        const a = el('a', {
          className: 'video-poster',
          attrs: {
            href: src,
            target: '_blank',
            rel: 'noopener',
            'aria-label': 'Open video (YouTube)'
          }
        });
        const img = el('img', { attrs: { src: poster, alt: '' } });
        a.appendChild(img);
        inner.appendChild(a);
        shell.appendChild(inner);
        iframe.replaceWith(shell);
        return;
      }
    }

    // Vimeo/Facebook/etc: keep iframe but inside a responsive shell with min-height
    inner.appendChild(iframe);
    shell.appendChild(inner);
    // Give a minimum height so failed loads don't become 0-height blank strips
    shell.style.minHeight = '220px';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';

    iframe.replaceWith(shell);
  });
}

/* -------------------------
   Render
-------------------------- */

export async function renderPost(container, postId) {
  const host = container || document.getElementById('app');
  if (!host) {
    console.error('[OkObserver] app container not found');
    return;
  }

  host.innerHTML = '';

  // Shell
  const back = el('a', {
    className: 'back-btn',
    attrs: { href: '#/' }
  }, '← Back to posts');

  // Save scroll so Home can restore when we navigate away
  back.addEventListener('click', () => saveScroll());

  const header = el('div', { className: 'post-header' });
  const heroWrap = el('div', { className: 'hero-wrap' });
  const titleEl = el('h1');
  const metaEl = el('div', { className: 'meta' });
  const bodyEl = el('div', { className: 'post-body' });

  header.appendChild(back);
  header.appendChild(titleEl);
  header.appendChild(metaEl);

  host.appendChild(header);
  host.appendChild(heroWrap);
  host.appendChild(bodyEl);

  // Load post
  let post = null;
  try {
    post = await fetchPost(postId);
  } catch (err) {
    // Diagnostics block
    titleEl.textContent = 'Post not found';
    metaEl.textContent = `Sorry, we couldn't load this post ${postId ? `(${postId})` : ''}.`;
    const diag = el('details', { className: 'card-body' });
    diag.appendChild(el('summary', null, 'Diagnostics (endpoints tried)'));
    const list = el('ul', { className: 'diag' }, [
      el('li', null, `${API_BASE}/posts/${postId}?_embed=1`),
      el('li', null, `${API_BASE}/pages/${postId}?_embed=1`),
      el('li', null, `${API_BASE}/media/${postId}?_embed=1`)
    ]);
    diag.appendChild(list);
    host.appendChild(diag);
    console.error('[OkObserver] Post load failed:', err);
    return;
  }

  // Title & meta
  titleEl.textContent = stripHtml(post?.title?.rendered) || 'Untitled';
  const by = post?._embedded?.author?.[0]?.name || 'Oklahoma Observer';
  const date = new Date(post.date).toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
  metaEl.textContent = `${by} — ${date}`;

  // Hero (featured image)
  const heroUrl = selectHero(post);
  heroWrap.innerHTML = '';
  if (heroUrl) {
    const link = el('a', { attrs: { href: heroUrl, target:'_blank', rel:'noopener', 'aria-label':'Open featured image' }});
    const heroImg = el('img', { className: 'hero', attrs: { src: heroUrl, alt: '' } });
    link.appendChild(heroImg);
    heroWrap.appendChild(link);
  }

  // Body/content
  bodyEl.innerHTML = post?.content?.rendered || '';

  // Make embeds responsive & avoid zero-height blanks
  wrapIframesResponsively(bodyEl);

  // Scroll to previous position if any
  restoreScroll();
}

// Default export for setups that expect it
export default renderPost;
