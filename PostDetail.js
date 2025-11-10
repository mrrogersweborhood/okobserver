/* 🟢 PostDetail.js — FULL FILE REPLACEMENT
   Build 2025-11-10R2-videoInjector-gapFree
   - Renders hero image
   - Injects a single, correct player for Vimeo/YouTube/Facebook
   - Removes empty placeholders/black boxes
   - No autoplay; min-height safeguard; wide responsive
*/

(function(){
  'use strict';

  var BUILD = '2025-11-10R2';
  console.log('[OkObserver] PostDetail Build', BUILD);

  function el(t,c,h){ var n=document.createElement(t); if(c) n.className=c; if(h!=null) n.innerHTML=h; return n; }
  function qs(s,r){ return (r||document).querySelector(s); }

  function extractProviderUrlFromHTML(html){
    if (!html) return null;
    // 1) iframe src
    var m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (m && m[1]) return m[1];
    // 2) raw Vimeo link
    m = html.match(/https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i);
    if (m && m[1]) return 'https://player.vimeo.com/video/'+m[1];
    // 3) raw YouTube links
    m = html.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-z0-9_\-]+)/i) || html.match(/https?:\/\/youtu\.be\/([a-z0-9_\-]+)/i);
    if (m && m[1]) return 'https://www.youtube.com/embed/'+m[1];
    // 4) Facebook
    m = html.match(/https?:\/\/(?:www\.)?facebook\.com\/(?:watch\/\?v=|[^/]+\/videos\/)(\d+)/i);
    if (m && m[1]) return 'https://www.facebook.com/plugins/video.php?href='+encodeURIComponent('https://www.facebook.com/watch/?v='+m[1])+'&show_text=false';
    return null;
  }

  function makeIframe(src){
    var ifr = document.createElement('iframe');
    ifr.src = src;
    ifr.allow = 'autoplay; encrypted-media; picture-in-picture; web-share';
    ifr.allowFullscreen = true;
    ifr.style.cssText = 'display:block;visibility:visible;width:100%;max-width:100%;min-height:420px;border:0;margin:16px auto;';
    return ifr;
  }

  function scrubEmptyEmbeds(root){
    // remove Gutenberg wrappers that are empty / zero-height
    var suspects = [].slice.call(root.querySelectorAll('figure, .wp-block-embed, .wp-embed-aspect-16-9, .fb-video, .fb-post'));
    suspects.forEach(function(s){
      var rect = s.getBoundingClientRect();
      if (!s.querySelector('iframe') && rect.height < 40) s.remove();
    });
    // remove lone black DIVs
    [].slice.call(root.querySelectorAll('div')).forEach(function(d){
      var rect = d.getBoundingClientRect();
      if (!d.querySelector('iframe') && rect.height < 20 && getComputedStyle(d).backgroundColor === 'rgb(0, 0, 0)'){
        d.remove();
      }
    });
  }

  function forceVisibleStyles(){
    var s = document.createElement('style');
    s.textContent = [
      'iframe, video, .wp-block-embed__wrapper, .wp-block-embed, .fb-video, .fb-post {',
      '  display:block !important; visibility:visible !important; opacity:1 !important;',
      '  width:100% !important; max-width:100% !important; min-height:420px !important;',
      '}',
      'div[data-oembed-url]{ display:block !important; visibility:visible !important; min-height:420px !important; }',
      '.post-hero-img{ width:100%; height:auto; display:block; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function injectPlayerIfMissing(bodyEl, contentHTML){
    // Already has a visible iframe?
    var existing = bodyEl.querySelector('iframe');
    if (existing){
      // Promote it: ensure sizing
      existing.style.minHeight = '420px';
      existing.style.width = '100%';
      existing.style.display = 'block';
      return;
    }
    var src = extractProviderUrlFromHTML(contentHTML || bodyEl.innerHTML);
    if (!src) return; // nothing to do
    var ifr = makeIframe(src);
    // Put the player right after the hero (or at the top of body)
    var anchor = bodyEl.querySelector('p, .wp-block-embed, figure') || bodyEl;
    anchor.insertAdjacentElement('afterbegin', ifr);
  }

  function renderPostDetail(post){
    var app = qs('#app');
    var d = new Date(post.date);
    app.innerHTML = [
      '<article class="post-detail">',
        '<header class="post-header">',
          '<h1 class="post-title">', (post.title && post.title.rendered || ''), '</h1>',
          '<div class="post-meta"><strong>Oklahoma Observer</strong> — ', d.toLocaleDateString(), '</div>',
        '</header>',
        post._ok_img ? ('<figure class="post-hero"><img class="post-hero-img" src="'+post._ok_img+'" alt=""></figure>') : '',
        '<section class="post-body">', (post.content && post.content.rendered || ''), '</section>',
        '<nav class="post-nav"><a class="back-btn" href="#/home">← Back to Posts</a></nav>',
      '</article>'
    ].join('');

    var body = qs('.post-body', app);
    // 1) make sure embeds are visible
    forceVisibleStyles();
    // 2) remove stray black boxes/empty wrappers
    scrubEmptyEmbeds(body);
    // 3) inject a correct player if none is currently present
    injectPlayerIfMissing(body, post.content && post.content.rendered);

    // Small observer to repair any async FB/Vimeo injections that flip display
    var mo = new MutationObserver(function(){
      var ifr = body.querySelector('iframe');
      if (ifr){
        ifr.style.display='block';
        ifr.style.visibility='visible';
        ifr.style.minHeight='420px';
      }
    });
    mo.observe(body, {subtree:true,childList:true,attributes:true});
  }

  window.renderPostDetail = renderPostDetail;
})();
 /* 🔴 PostDetail.js — END FULL FILE */
