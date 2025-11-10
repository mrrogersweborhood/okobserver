/* 🟢 PostDetail.js — FULL FILE REPLACEMENT
   OkObserver Build 2025-11-10R5-videoForceDetect
   Purpose: Force a visible player for Vimeo/YouTube/Facebook on posts like /post/381733.
   Strategy:
     1) Find an existing iframe and normalize it (display:block; min-height).
     2) If none, scan for: data-oembed-url, <figure data-oembed-url>, <a href>, raw URL text, Gutenberg wrappers.
     3) Derive an embeddable SRC and inject a first-class <iframe>.
     4) Clean tiny black placeholders.
   Includes a small diagnostic banner (remove later if desired).
*/

(function(){
  'use strict';

  var BUILD = '2025-11-10R5-videoForceDetect';
  console.log('[OkObserver] PostDetail Build', BUILD);

  // ---------- Utilities ----------
  function qs(s, r){ return (r||document).querySelector(s); }
  function qsa(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function el(t,c,h){ var n=document.createElement(t); if(c) n.className=c; if(h!=null) n.innerHTML=h; return n; }
  function fmtDate(iso){ try{ return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch(e){return iso;} }

  // Add a tiny dev banner once (helps verify what we detected on 381733)
  function devBanner(lines){
    try{
      if (document.getElementById('okobs-dev-banner')) return;
      var b = el('div','okobs-dev-banner', '<strong>OkObserver video debug</strong><br>'+lines.map(escapeHTML).join('<br>'));
      b.id = 'okobs-dev-banner';
      b.style.cssText = 'position:sticky;top:0;z-index:2000;background:#fffbcc;color:#333;padding:6px 10px;border-bottom:1px solid #e6d87a;font:12px/1.35 system-ui;box-shadow:0 2px 6px rgba(0,0,0,.08)';
      document.body.prepend(b);
    }catch(e){}
  }
  function escapeHTML(s){ return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // ---------- Detection ----------
  function firstExistingIframe(scope){
    var ifr = scope.querySelector('iframe');
    return ifr || null;
  }

  function getDataOembedUrl(scope){
    // Gutenberg blocks commonly set this
    var el1 = scope.querySelector('[data-oembed-url]');
    if (el1 && el1.getAttribute('data-oembed-url')) return el1.getAttribute('data-oembed-url');
    // sometimes figure has it
    var el2 = scope.querySelector('figure[data-oembed-url]');
    if (el2) return el2.getAttribute('data-oembed-url');
    return null;
  }

  function findAnchorUrl(scope){
    // Prefer anchors whose textContent is exactly the href (raw pasted link)
    var anchors = qsa('a[href]', scope);
    for (var i=0;i<anchors.length;i++){
      var a = anchors[i];
      var href = (a.getAttribute('href')||'').trim();
      if (!href) continue;
      var txt = (a.textContent||'').trim();
      if (txt === href) return href;
      // fallback: first href containing known providers
      if (/vimeo\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch/i.test(href)) return href;
    }
    return null;
  }

  function findRawUrlText(scope){
    // Look for bare URLs (text nodes) in common wrappers
    var urlRe = /(https?:\/\/[^\s<>"']+)/i;
    var nodes = qsa('p, div, span, li, figure', scope);
    for (var i=0;i<nodes.length;i++){
      var html = nodes[i].innerHTML;
      var m = html && html.match(urlRe);
      if (m && m[1]) return m[1];
    }
    return null;
  }

  function toEmbeddableSrc(url){
    if (!url) return null;
    try{
      var u = new URL(url);
      var host = u.hostname.replace(/^www\./,'').toLowerCase();

      // Vimeo: vimeo.com/{id} or player.vimeo.com/video/{id}
      if (host === 'vimeo.com') {
        var id = u.pathname.split('/').filter(Boolean)[0];
        if (/^\d+$/.test(id)) return 'https://player.vimeo.com/video/'+id;
      }
      if (host === 'player.vimeo.com') {
        return url; // already embeddable
      }

      // YouTube: youtube.com/watch?v=.. or youtu.be/..
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        var vid = u.searchParams.get('v');
        if (vid) return 'https://www.youtube.com/embed/'+vid;
      }
      if (host === 'youtu.be') {
        var vid2 = u.pathname.split('/').filter(Boolean)[0];
        if (vid2) return 'https://www.youtube.com/embed/'+vid2;
      }

      // Facebook: fb.watch or facebook.com/.../videos/{id}
      if (host === 'fb.watch') {
        return 'https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(url)+'&show_text=false';
      }
      if (host.endsWith('facebook.com')) {
        // Accept as-is: FB plugin URL or watch URL
        if (u.pathname.indexOf('/plugins/video.php') !== -1) return url;
        return 'https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(url)+'&show_text=false';
      }
    }catch(e){}
    return null;
  }

  // ---------- Normalization ----------
  function normalizeIframe(ifr){
    if (!ifr) return;
    var cs = getComputedStyle(ifr);
    if (cs.display === 'none') ifr.style.display = 'block';
    if (parseInt(cs.height,10) < 200 || ifr.offsetHeight < 200) ifr.style.minHeight = '420px';
    ifr.style.width = '100%';
    ifr.style.maxWidth = '100%';
    ifr.style.border = '0';
    ifr.style.visibility = 'visible';
    ifr.removeAttribute('hidden');
  }

  function injectIframe(scope, src){
    var ifr = document.createElement('iframe');
    ifr.src = src;
    ifr.allow = 'autoplay; encrypted-media; picture-in-picture; web-share';
    ifr.allowFullscreen = true;
    ifr.setAttribute('frameborder','0');
    ifr.loading = 'lazy';
    ifr.style.cssText = 'display:block;visibility:visible;width:100%;max-width:100%;min-height:420px;border:0;margin:16px 0';
    // insert at very top of content
    scope.insertAdjacentElement('afterbegin', ifr);
    return ifr;
  }

  function scrubTinyBlackBoxes(scope){
    qsa('figure, .wp-block-embed, .wp-embed-aspect-16-9, .fb-video, .fb-post, div', scope).forEach(function(node){
      var hasIframe = !!node.querySelector('iframe');
      var rect = node.getBoundingClientRect();
      var bg = getComputedStyle(node).backgroundColor;
      if (!hasIframe && rect.height < 24 && (bg === 'rgb(0, 0, 0)' || bg === 'rgba(0, 0, 0, 1)')) {
        node.remove();
      }
    });
  }

  // ---------- Public render ----------
  window.renderPostDetail = function renderPostDetail(post){
    var app = qs('#app');

    var author = (post._embedded && post._embedded.author && post._embedded.author[0] && post._embedded.author[0].name) || 'Oklahoma Observer';
    var dateStr = fmtDate(post.date_gmt || post.date);

    // Order: HERO → TITLE → BYLINE → CONTENT → Back button
    var article = el('article','post-detail','');
    if (post._ok_img) {
      article.appendChild(el('figure','post-hero','<img class="post-hero-img" alt="" src="'+post._ok_img+'">'));
    }
    article.appendChild(el('h1','post-title', post.title && post.title.rendered || ''));
    article.appendChild(el('div','post-byline','<strong>'+author+'</strong> — '+dateStr));
    var body = el('section','post-body', post.content && post.content.rendered || '');
    article.appendChild(body);
    var nav = el('nav','post-nav','');
    var btn = el('button','back-to-posts','← Back to Posts');
    btn.type='button';
    btn.addEventListener('click', function(){ location.hash = '#/posts'; });
    nav.appendChild(btn);
    article.appendChild(nav);

    app.innerHTML = '';
    app.appendChild(article);

    // ---- VIDEO: detect, normalize, or inject ----
    var foundExisting = !!firstExistingIframe(body);
    var dataEmbed = getDataOembedUrl(body);
    var aUrl = findAnchorUrl(body);
    var rawUrl = findRawUrlText(body);
    var chosenUrl = dataEmbed || aUrl || rawUrl || null;
    var embedSrc = foundExisting ? null : toEmbeddableSrc(chosenUrl);

    devBanner([
      'PostDetail.js '+BUILD,
      'existing iframe: ' + (foundExisting ? 'YES' : 'NO'),
      'data-oembed-url: ' + (dataEmbed || 'none'),
      'anchor url: ' + (aUrl || 'none'),
      'raw url: ' + (rawUrl || 'none'),
      'embed src to inject: ' + (embedSrc || 'none')
    ]);

    var ifr = firstExistingIframe(body);
    if (ifr) {
      normalizeIframe(ifr);
    } else if (embedSrc) {
      normalizeIframe(injectIframe(body, embedSrc));
    }

    // scrub tiny black boxes / empty wrappers
    scrubTinyBlackBoxes(body);

    // After hero image load, re-normalize
    var hero = qs('.post-hero-img', article);
    if (hero) {
      if (hero.complete) {
        var ifr2 = firstExistingIframe(body);
        if (ifr2) normalizeIframe(ifr2);
      } else {
        hero.addEventListener('load', function(){
          var ifr3 = firstExistingIframe(body);
          if (ifr3) normalizeIframe(ifr3);
        }, {once:true});
      }
    }

    // Watch for async script replacing embeds (FB/Vimeo)
    var mo = new MutationObserver(function(){
      var i = firstExistingIframe(body);
      if (i) normalizeIframe(i);
    });
    mo.observe(body, {childList:true, subtree:true, attributes:true});
  };

})();
 /* 🔴 PostDetail.js — END FULL FILE */
