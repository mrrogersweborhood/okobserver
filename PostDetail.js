/* 🟢 PostDetail.js — start of full file */
/* OkObserver Build 2025-11-19R1-videoEmbedFix1
   Focused detail enhancer:
   - Find a video URL in the post body.
   - Insert a single real iframe (Vimeo / YouTube / FB).
   - Remove the bare URL paragraph to avoid duplicates.
   - Hard fallback for /post/381733.
   - NO global min-height CSS or generic white boxes.
*/
(function () {
  'use strict';

  var BUILD = '2025-11-19R1-videoEmbedFix1';
  console.log('[OkObserver] PostDetail Build', BUILD);

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call(
      (root || document).querySelectorAll(sel)
    );
  }

  // Basic iframe styling for our own embeds
  function normalizeIframe(ifr) {
    if (!ifr) return;
    ifr.style.display = 'block';
    if (!ifr.style.minHeight) ifr.style.minHeight = '360px';
    ifr.setAttribute(
      'allow',
      'autoplay; encrypted-media; picture-in-picture'
    );
    ifr.setAttribute('allowfullscreen', 'true');
    ifr.style.width = '100%';
    ifr.style.maxWidth = '100%';
    ifr.style.border = '0';
    ifr.style.margin = '12px auto';
  }

  function injectIframeAtTop(body, src) {
    var ifr = document.createElement('iframe');
    ifr.src = src;
    ifr.setAttribute('data-okobs-video', '1');

    if (body.firstChild) {
      body.insertBefore(ifr, body.firstChild);
    } else {
      body.appendChild(ifr);
    }
    return ifr;
  }

  // Try to derive an embeddable src from the body content
  function deriveEmbedSrc(body) {
    if (!body) return null;

    var url = null;

    // 1) data-oembed-url (WordPress embed wrapper)
    var wrap = qs('[data-oembed-url]', body);
    if (wrap) {
      url = wrap.getAttribute('data-oembed-url') || null;
    }

    // 2) naked anchors
    if (!url) {
      var a = qs(
        'a[href*="vimeo.com/"], a[href*="youtube.com/watch"], a[href*="youtu.be/"], a[href*="facebook.com/"]',
        body
      );
      if (a) {
        url = a.getAttribute('href') || null;
      }
    }

    // 3) raw text anywhere in the HTML
    if (!url) {
      var html = body.innerHTML || '';
      var m = html.match(/https?:\/\/[^\s"'<>]+/);
      if (m && m[0]) url = m[0];
    }

    if (!url) return null;

    // Vimeo
    var v = url.match(/vimeo\.com\/(\d{6,12})/i);
    if (v && v[1]) {
      return 'https://player.vimeo.com/video/' + v[1];
    }

    // YouTube
    var y = url.match(
      /(?:youtube\.com\/watch\?[^"'<>]*v=|youtu\.be\/)([\w\-]{6,})/i
    );
    if (y && y[1]) {
      return 'https://www.youtube.com/embed/' + y[1];
    }

    // Facebook video/post
    if (/facebook\.com\//i.test(url)) {
      return (
        'https://www.facebook.com/plugins/video.php?href=' +
        encodeURIComponent(url) +
        '&show_text=false'
      );
    }

    return null;
  }

  // Remove leading paragraphs that are basically just a video URL
  function scrubUrlParas(body) {
    if (!body) return;

    var changed = false;

    while (body.firstElementChild && body.firstElementChild.tagName === 'P') {
      var p = body.firstElementChild;
      var txt = (p.textContent || '').replace(/\u00a0/g, ' ').trim();

      if (!txt) {
        // Truly empty paragraph at the top
        p.parentNode.removeChild(p);
        changed = true;
        continue;
      }

      // Paragraph that is basically just one or more URLs
      var urlRegex = /https?:\/\/[^\s]+/gi;
      var stripped = txt.replace(urlRegex, '').trim();
      if (stripped.length === 0) {
        p.parentNode.removeChild(p);
        changed = true;
        continue;
      }

      break;
    }

    if (changed && body.firstElementChild) {
      body.firstElementChild.style.marginTop = '0';
    }
  }

  function enhanceDetail() {
    var body = qs('.post-body');
    if (!body) return;

    // If we've already inserted our own iframe, just normalize it
    var ours = qs('iframe[data-okobs-video="1"]', body);
    if (ours) {
      normalizeIframe(ours);
      return;
    }

    // If there is already a "real" video iframe from WP, keep it and
    // just normalize + scrub URL-only paragraphs.
    var existing = qsa('iframe', body).filter(function (ifr) {
      var src = ifr.getAttribute('src') || '';
      return /player\.vimeo\.com|youtube\.com\/embed|facebook\.com\/plugins\/video/.test(
        src
      );
    });

    if (existing.length) {
      existing.forEach(normalizeIframe);
      scrubUrlParas(body);
      return;
    }

    // Otherwise, derive a src from the content (URL, anchor, etc.)
    var src = deriveEmbedSrc(body);

    // Hard fallback for /post/381733 if nothing else found
    var hash = location.hash || '';
    if (!src && /^#\/post\/381733$/.test(hash)) {
      src = 'https://player.vimeo.com/video/1126193884';
      console.log(
        '[OkObserver] Fallback Vimeo src for /post/381733 via PostDetail.js'
      );
    }

    if (!src) return; // No video; nothing to do

    // Insert iframe at the top of the body and clean up URL-only paras
    var ifr = injectIframeAtTop(body, src);
    normalizeIframe(ifr);
    scrubUrlParas(body);
  }

  // Run after main.js has rendered the detail view
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(enhanceDetail, 80);
  });

  window.addEventListener('hashchange', function () {
    setTimeout(enhanceDetail, 120);
  });
})();
/* 🔴 PostDetail.js — end of full file */
