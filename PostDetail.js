/* 🟢 PostDetail.js — full file replacement (OkObserver Build 2025-11-10R1-embedFix)
   NOTE: This file is a complete replacement. The 🟢/🔴 markers are required by the user. */

(function () {
  'use strict';

  // Utility: simple entity decoder so WP body with &amp; etc. becomes real text
  function decodeEntities(html) {
    const ta = document.createElement('textarea');
    ta.innerHTML = html;
    return ta.value;
  }

  // Utility: make provider iframe from a plain URL
  function iframeFromUrl(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');

      // Vimeo: https://vimeo.com/{id}
      if (host === 'vimeo.com') {
        const id = u.pathname.split('/').filter(Boolean)[0];
        if (id && /^\d+$/.test(id)) {
          const ifr = document.createElement('iframe');
          ifr.src = `https://player.vimeo.com/video/${id}`;
          ifr.allow = 'autoplay; encrypted-media; picture-in-picture';
          ifr.allowFullscreen = true;
          ifr.setAttribute('frameborder', '0');
          ifr.style.width = '100%';
          ifr.style.maxWidth = '100%';
          ifr.style.display = 'block';
          ifr.style.minHeight = '420px';
          ifr.style.border = '0';
          ifr.loading = 'lazy';
          return ifr;
        }
      }

      // YouTube (watch or youtu.be)
      if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
        let vid = null;
        if (host === 'youtu.be') {
          vid = u.pathname.split('/').filter(Boolean)[0];
        } else if (u.pathname === '/watch') {
          vid = u.searchParams.get('v');
        } else if (u.pathname.startsWith('/shorts/')) {
          vid = u.pathname.split('/').filter(Boolean)[1];
        }
        if (vid) {
          const ifr = document.createElement('iframe');
          ifr.src = `https://www.youtube.com/embed/${vid}`;
          ifr.allow = 'autoplay; encrypted-media; picture-in-picture';
          ifr.allowFullscreen = true;
          ifr.setAttribute('frameborder', '0');
          ifr.style.width = '100%';
          ifr.style.maxWidth = '100%';
          ifr.style.display = 'block';
          ifr.style.minHeight = '420px';
          ifr.style.border = '0';
          ifr.loading = 'lazy';
          return ifr;
        }
      }

      // Facebook video URLs (fb.watch or facebook.com/plugins/video)
      if (host === 'fb.watch' || host.endsWith('facebook.com')) {
        const ifr = document.createElement('iframe');
        const href = encodeURIComponent(url);
        ifr.src = `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false`;
        ifr.allow = 'autoplay; encrypted-media; picture-in-picture';
        ifr.allowFullscreen = true;
        ifr.setAttribute('frameborder', '0');
        ifr.style.width = '100%';
        ifr.style.maxWidth = '100%';
        ifr.style.display = 'block';
        ifr.style.minHeight = '420px';
        ifr.style.border = '0';
        ifr.loading = 'lazy';
        return ifr;
      }
    } catch (e) {
      // ignore bad URLs
    }
    return null;
  }

  // Ensure any existing iframes are visible and have height
  function normalizeIframes(scope) {
    scope.querySelectorAll('iframe').forEach(ifr => {
      const cs = getComputedStyle(ifr);
      if (cs.display === 'none') ifr.style.display = 'block';
      if (parseInt(cs.height, 10) < 200 || ifr.offsetHeight < 200) {
        ifr.style.minHeight = '420px';
      }
      ifr.style.width = '100%';
      ifr.style.maxWidth = '100%';
      ifr.style.border = '0';
    });
  }

  // From router - render function for the detail page
  window.renderPostDetail = async function renderPostDetail(post, options = {}) {
    const root = document.getElementById('app');
    root.innerHTML = `
      <article class="post-detail">
        <header class="post-header">
          <h1 class="post-title">${post.title?.rendered || ''}</h1>
          <div class="post-meta">
            <span class="post-byline"><strong>Oklahoma Observer</strong> — ${new Date(post.date).toLocaleDateString()}</span>
          </div>
        </header>
        <figure class="post-hero">
          ${post._ok_featuredImg ? `<img class="post-hero-img" src="${post._ok_featuredImg}" alt="">` : ''}
        </figure>
        <section class="post-body"></section>
        <nav class="post-nav">
          <button class="back-btn" onclick="history.back()">← Back to Posts</button>
        </nav>
      </article>
    `;

    // Render post body safely (decode entities, let provider markup exist)
    const body = root.querySelector('.post-body');
    const html = decodeEntities(post.content?.rendered || '');
    body.innerHTML = html;

    // Convert raw provider links into embeds (common for Vimeo)
    // We look for standalone <a> lines and plaintext URLs in paragraphs
    const candidates = [];
    body.querySelectorAll('a[href]').forEach(a => {
      // Only if anchor contains *only* the URL text or is clearly the single child
      const text = a.textContent.trim();
      if (text === a.getAttribute('href').trim()) candidates.push(a);
    });
    body.childNodes.forEach(node => {
      if (node.nodeType === 3) {
        const raw = node.nodeValue.trim();
        if (raw.startsWith('http')) {
          // wrap in a span for replacement
          const span = document.createElement('span');
          span.textContent = raw;
          node.parentNode.replaceChild(span, node);
          candidates.push(span);
        }
      }
    });

    candidates.forEach(el => {
      const url = (el.getAttribute && el.getAttribute('href')) || el.textContent?.trim();
      const ifr = iframeFromUrl(url || '');
      if (ifr) {
        // Replace the link/text with the iframe
        const p = el.closest('p') || el;
        p.replaceWith(ifr);
      }
    });

    // Normalize any existing iframes that came from WP oEmbed
    normalizeIframes(body);

    // After hero image loads, recheck in case layout shifted
    const hero = root.querySelector('.post-hero-img');
    if (hero) {
      if (hero.complete) {
        normalizeIframes(body);
      } else {
        hero.addEventListener('load', () => normalizeIframes(body), { once: true });
        hero.addEventListener('error', () => normalizeIframes(body), { once: true });
      }
    }
  };
})();

/* 🔴 PostDetail.js — end of full file */
