/* 🟢 PostDetail.js — start of full file */
/* OkObserver Build 2025-11-19R3-lazyFix2
   Left intact to avoid regressions; works in tandem with main.js spacing scrub + CSS white-gap fix.
   Video: detect existing iframes; if none, derive embeddable src; hard fallback for /post/381733.
*/
(function(){
  'use strict';

    var BUILD = '2025-11-19R3-lazyFix2';
  console.log('[OkObserver] PostDetail Build', BUILD);

  function qs(s, r){ return (r||document).querySelector(s); }
  function qsa(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }

  // Normalize all embeds/iframes we find
  function normalizeIframe(ifr){
    if (!ifr) return;

    // If this is a lazyload placeholder / SVG shim with data-src (e.g. Vimeo),
    // promote it to a real embed so we don't get a big white box.
    try {
      var lazySrc = (ifr.getAttribute('data-src') || ifr.getAttribute('data-lazy-src') || '').trim();
      var currentSrc = (ifr.getAttribute('src') || '').trim();
      var isPlaceholderSrc = /^data:image\/svg\+xml/i.test(currentSrc);
      var hasLazyClass = !!(ifr.classList && (ifr.classList.contains('lazyload') || ifr.classList.contains('lazyloaded')));

      if (lazySrc && /^https?:\/\//i.test(lazySrc) && (isPlaceholderSrc || hasLazyClass)) {
        ifr.setAttribute('src', lazySrc);
        ifr.removeAttribute('data-src');
        ifr.removeAttribute('data-lazy-src');
        if (ifr.classList) {
          ifr.classList.remove('lazyload');
          ifr.classList.remove('lazyloaded');
        }
        console.log('[OkObserver] normalizeIframe promoted lazy iframe', lazySrc);
      }
    } catch (e) {
      // fail-safe: never break the page if this throws
      console.warn('[OkObserver] normalizeIframe lazyload fix error', e);
    }

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
      .post-detail .post-body iframe,
      .post-detail .post-body .fb-video,
      .post-detail .post-body .fb-post {
        display:block !important;
        min-height:360px;
        margin-bottom:16px;
      }
      .post-detail .post-body .fb-post,
      .post-detail .post-body .fb-video {
        width:100% !important;
      }
    `;
    document.head && document.head.appendChild(css);
  }

  // Try to derive a single main embed src from the content
  function deriveEmbed(body){
    if (!body) return null;

    // First, see if there's an iframe already that looks like Vimeo/YT/FB
    var ifr = qs('iframe', body);
    if (ifr) {
      var src = (ifr.getAttribute('src') || '').trim();
      var dataSrc = (ifr.getAttribute('data-src') || '').trim();

      // If it's a lazyload placeholder, prefer data-src
      var candidate = dataSrc || src;
      if (candidate) {
        var normalized = normalizeUrl(candidate);
        if (normalized) return normalized;
      }
    }

    // Next, scan for obvious links
    var anchors = qsa('a[href]', body);
    for (var i=0;i<anchors.length;i++){
      var href = (anchors[i].getAttribute('href') || '').trim();
      var norm = normalizeUrl(href);
      if (norm) return norm;
    }

    // Finally, just look for any URL-ish text that matches video providers
    var text = body.innerText || '';
    var m = text.match(/https?:\/\/[^\s]+/);
    if (m && m[0]) return normalizeUrl(m[0]);

    return null;
  }

  function normalizeUrl(url){
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

    // Hard fallback for /post/381733
    var hash = location.hash || '';
    if (/^#\/post\/381733$/.test(hash)) {
      // if still nothing, synthesize a Vimeo iframe using the known id
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
 /* 🔴 PostDetail.js — end of full file */
