/* 🟢 PostDetail.js — FULL FILE REPLACEMENT
   OkObserver Build 2025-11-10R4-detailOrder+video+backBtn
   - Order: HERO → TITLE → BYLINE → CONTENT → Back button (bottom-left)
   - Video injector: creates visible iframe for Vimeo/YouTube/Facebook if missing
   - Ensures existing iframes are visible and non-zero height
   - No autoplay; responsive width; min-height guard
*/

(function(){
  'use strict';

  var BUILD = '2025-11-10R4-detailOrder+video+backBtn';
  console.log('[OkObserver] PostDetail Build', BUILD);

  // Utilities
  function qs(s, r){ return (r||document).querySelector(s); }
  function el(t,c,h){ var n=document.createElement(t); if(c) n.className=c; if(h!=null) n.innerHTML=h; return n; }
  function fmtDate(iso){ try{ return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch(e){return iso;} }

  // Extract an embeddable src from HTML (iframe or raw URL)
  function extractEmbedSrc(html){
    if (!html) return null;
    var m;
    // 1) iframe src
    m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (m && m[1]) return m[1];

    // 2) Vimeo raw URL → player URL
    m = html.match(/https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i);
    if (m && m[1]) return 'https://player.vimeo.com/video/'+m[1];

    // 3) YouTube (watch or youtu.be) → embed
    m = html.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-z0-9_\-]+)/i) || html.match(/https?:\/\/youtu\.be\/([a-z0-9_\-]+)/i);
    if (m && m[1]) return 'https://www.youtube.com/embed/'+m[1];

    // 4) Facebook → plugin
    m = html.match(/https?:\/\/(?:www\.)?facebook\.com\/(?:watch\/\?v=|[^/]+\/videos\/)(\d+)/i);
    if (m && m[1]) return 'https://www.facebook.com/plugins/video.php?href='+encodeURIComponent('https://www.facebook.com/watch/?v='+m[1])+'&show_text=false';

    return null;
  }

  function makeIframe(src){
    var ifr = document.createElement('iframe');
    ifr.src = src;
    ifr.allow = 'autoplay; encrypted-media; picture-in-picture; web-share';
    ifr.allowFullscreen = true;
    ifr.setAttribute('frameborder','0');
    ifr.loading = 'lazy';
    ifr.style.display = 'block';
    ifr.style.visibility = 'visible';
    ifr.style.width = '100%';
    ifr.style.maxWidth = '100%';
    ifr.style.minHeight = '420px';
    ifr.style.border = '0';
    return ifr;
  }

  function normalizeExistingIframes(scope){
    scope.querySelectorAll('iframe').forEach(function(ifr){
      var cs = getComputedStyle(ifr);
      if (cs.display === 'none') ifr.style.display = 'block';
      if (parseInt(cs.height,10) < 200 || ifr.offsetHeight < 200) ifr.style.minHeight = '420px';
      ifr.style.width = '100%';
      ifr.style.maxWidth = '100%';
      ifr.style.border = '0';
      ifr.style.visibility = 'visible';
      ifr.removeAttribute('hidden');
    });
  }

  function scrubEmptyPlaceholders(scope){
    // Remove tiny empty wrappers/black boxes
    scope.querySelectorAll('figure, .wp-block-embed, .wp-embed-aspect-16-9, .fb-video, .fb-post, div').forEach(function(node){
      var hasIframe = !!node.querySelector('iframe');
      var rect = node.getBoundingClientRect();
      var bg = getComputedStyle(node).backgroundColor;
      if (!hasIframe && rect.height < 24 && (bg === 'rgb(0, 0, 0)' || bg === 'rgba(0, 0, 0, 1)')) {
        node.remove();
      }
    });
  }

  // PUBLIC: renderPostDetail(post) is called by main.js
  window.renderPostDetail = function renderPostDetail(post){
    var app = qs('#app');
    var author = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
    var dateStr = fmtDate(post.date_gmt || post.date);

    // Build DOM in the required order
    var article = el('article','post-detail');

    // HERO image first (edge-to-edge contained)
    if (post._ok_img) {
      var fig = el('figure','post-hero','<img class="post-hero-img" alt="" src="'+post._ok_img+'">');
      article.appendChild(fig);
    }

    // TITLE next
    var h1 = el('h1','post-title', post.title?.rendered || '');
    article.appendChild(h1);

    // BYLINE next
    var by = el('div','post-byline','<strong>'+author+'</strong> — '+dateStr);
    article.appendChild(by);

    // CONTENT
    var body = el('section','post-body', post.content?.rendered || '');
    article.appendChild(body);

    // Back button (real <button>) at very bottom, left-aligned
    var nav = el('nav','post-nav','');
    var btn = el('button','back-to-posts','← Back to Posts');
    btn.type = 'button';
    btn.addEventListener('click', function(){
      // go home and let SPA render
      location.hash = '#/posts';
      // optional: scroll restore handled in main.js
    });
    nav.appendChild(btn);
    article.appendChild(nav);

    // Mount
    app.innerHTML = '';
    app.appendChild(article);

    // Ensure embeds are visible, inject if missing
    enforceEmbedVisibility(body);

    // After hero load, re-normalize (layout shifts)
    var hero = qs('.post-hero-img', article);
    if (hero) {
      if (hero.complete) enforceEmbedVisibility(body);
      else {
        hero.addEventListener('load', function(){ enforceEmbedVisibility(body); }, {once:true});
        hero.addEventListener('error', function(){ enforceEmbedVisibility(body); }, {once:true});
      }
    }
  };

  function enforceEmbedVisibility(scope){
    // 1) If an iframe exists, make sure it's visible and tall enough
    normalizeExistingIframes(scope);

    // 2) If no iframe, try to build one from the content HTML
    if (!scope.querySelector('iframe')) {
      var src = extractEmbedSrc(scope.innerHTML);
      if (src) {
        var ifr = makeIframe(src);
        // Insert the player at the very top of the content
        scope.insertAdjacentElement('afterbegin', ifr);
      }
    }

    // 3) Clean tiny black placeholders
    scrubEmptyPlaceholders(scope);
  }

})();
 /* 🔴 PostDetail.js — END FULL FILE */
