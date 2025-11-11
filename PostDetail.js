/* 🟢 PostDetail.js — FULL FILE REPLACEMENT
   OkObserver Build 2025-11-10R6
   - Detail order: HERO → TITLE → BYLINE → CONTENT → Back-to-Posts BUTTON (bottom-left)
   - Video: detect existing iframes; if none, derive embeddable src from data-oembed-url / anchors / raw text
   - Normalizes any iframe (display:block; min-height guard)
   - Hard fallback for /post/381733 to inject Vimeo player if still missing
*/

(function(){
  'use strict';

  var BUILD = '2025-11-10R6';
  console.log('[OkObserver] PostDetail Build', BUILD);

  function qs(s, r){ return (r||document).querySelector(s); }
  function qsa(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }

  // Normalize all embeds/iframes we find
  function normalizeIframe(ifr){
    if (!ifr) return;
    ifr.style.display = 'block';
    if (!ifr.style.minHeight) ifr.style.minHeight = '360px';
    ifr.setAttribute('allow','autoplay; encrypted-media; picture-in-picture');
    ifr.setAttribute('allowfullscreen','true');
    ifr.style.width = '100%';
    ifr.style.maxWidth = '100%';
    ifr.style.border = '0';
    ifr.style.margin = '12px auto';
  }

  function ensureEmbedsVisible(){
    var css = document.createElement('style');
    css.textContent = `
      iframe, video, .wp-block-embed__wrapper, .wp-block-embed, .fb-video, .fb-post { 
        display:block !important; visibility:visible !important;
        width:100% !important; max-width:100%; min-height:360px !important; 
        border:0; margin:12px auto;
      }
      div[data-oembed-url]{ display:block !important; visibility:visible !important; min-height:360px !important; }
    `;
    document.head.appendChild(css);
  }

  // If no iframe exists, try to build one from content
  function deriveEmbed(body){
    // 1) data-oembed-url (WP)
    var wrap = qs('[data-oembed-url]', body);
    var url = wrap && wrap.getAttribute('data-oembed-url');

    // 2) naked anchors
    if (!url) {
      var a = qs('a[href*="vimeo.com/"], a[href*="youtube.com/watch"], a[href*="youtu.be/"], a[href*="facebook.com/"]', body);
      url = a && a.getAttribute('href');
    }

    // 3) raw text
    if (!url) {
      var m = body.innerHTML.match(/https?:\/\/[^\s"'<>]+/);
      url = m && m[0];
    }

    if (!url) return null;

    // Vimeo
    var v = url.match(/vimeo\.com\/(\d{6,12})/i);
    if (v) return 'https://player.vimeo.com/video/' + v[1];

    // YouTube
    var y = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w\-]{6,})/i);
    if (y) return 'https://www.youtube.com/embed/' + y[1];

    // Facebook video/post
    if (/facebook\.com\//i.test(url))
      return 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(url) + '&show_text=false';

    return null;
  }

  function injectIframe(body, src){
    var ifr = document.createElement('iframe');
    ifr.src = src;
    body.appendChild(ifr);
    return ifr;
  }

  function enhanceDetail(){
    ensureEmbedsVisible();

    var body = qs('.post-body');
    if (!body) return;

    // already present?
    var exist = qsa('iframe, .fb-video, .fb-post', body);
    exist.forEach(normalizeIframe);
    if (exist.length) return;

    // try to derive
    var src = deriveEmbed(body);
    if (src) { normalizeIframe(injectIframe(body, src)); return; }

    // Hard fallback for the problem child (if content contains a Vimeo id in plain text)
    var path = location.hash || '';
    if (/^#\/post\/381733$/.test(path)) {
      var mm = (body.innerText || '').match(/vimeo\.com\/(\d{6,12})/i);
      if (mm && mm[1]) {
        normalizeIframe(injectIframe(body, 'https://player.vimeo.com/video/' + mm[1]));
        console.log('[OkObserver] Forced Vimeo iframe for /post/381733');
      }
    }
  }

  // run after main.js puts the content in place
  document.addEventListener('DOMContentLoaded', () => setTimeout(enhanceDetail, 50));
  window.addEventListener('hashchange', () => setTimeout(enhanceDetail, 100));

})();
 /* 🔴 PostDetail.js — END FULL FILE */
