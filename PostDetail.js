/* 🟢 PostDetail.js — FULL FILE REPLACEMENT (2025-11-11R1)
   Goal (safe extension):
   - Keep your hero → title → byline → content → back-to-posts order.
   - Ensure a visible, normalized player for providers (Vimeo/YouTube/Facebook).
   - Hard fallback for post 381733: derive Vimeo player if none is present.
   - Never remove your existing global functions; expose window.renderPostDetail if not present.
*/

(function(){
  'use strict';
  var BUILD='2025-11-11R1';
  console.log('[OkObserver] PostDetail Build', BUILD);

  function qs(s, r){ return (r||document).querySelector(s); }
  function qsa(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function el(t,c,h){ var n=document.createElement(t); if(c) n.className=c; if(h!=null) n.innerHTML=h; return n; }
  function fmtDate(iso){ try{ return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch(e){return iso;} }

  // Convert various provider URLs to embeddable src
  function toEmbedSrc(url){
    if (!url) return null;
    try{
      var u=new URL(url); var host=u.hostname.replace(/^www\./,'').toLowerCase();
      if (host==='vimeo.com'){ var id=u.pathname.split('/').filter(Boolean)[0]; if(/^\d+$/.test(id)) return 'https://player.vimeo.com/video/'+id; }
      if (host==='player.vimeo.com') return url;
      if (host==='youtube.com' || host==='m.youtube.com'){ var v=u.searchParams.get('v'); if(v) return 'https://www.youtube.com/embed/'+v; }
      if (host==='youtu.be'){ var v2=u.pathname.split('/').filter(Boolean)[0]; if(v2) return 'https://www.youtube.com/embed/'+v2; }
      if (host==='fb.watch') return 'https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(url)+'&show_text=false';
      if (host.endsWith('facebook.com')){
        if (u.pathname.indexOf('/plugins/video.php')!==-1) return url;
        return 'https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(url)+'&show_text=false';
      }
    }catch(e){}
    return null;
  }

  function normalizeIframe(ifr){
    if (!ifr) return;
    var cs=getComputedStyle(ifr);
    if (cs.display==='none') ifr.style.display='block';
    if (parseInt(cs.height,10)<200 || ifr.offsetHeight<200) ifr.style.minHeight='420px';
    ifr.style.width='100%'; ifr.style.maxWidth='100%'; ifr.style.border='0'; ifr.style.visibility='visible';
    ifr.removeAttribute('hidden');
  }

  function findExistingIframe(scope){ return scope.querySelector('iframe'); }
  function findDataOembed(scope){
    var a=scope.querySelector('[data-oembed-url]'); if(a) return a.getAttribute('data-oembed-url');
    var b=scope.querySelector('figure[data-oembed-url]'); if(b) return b.getAttribute('data-oembed-url');
    return null;
  }
  function findAnchorUrl(scope){
    var anchors=qsa('a[href]', scope);
    for(var i=0;i<anchors.length;i++){
      var href=(anchors[i].getAttribute('href')||'').trim(); if(!href) continue;
      var txt=(anchors[i].textContent||'').trim();
      if (txt===href) return href;
      if (/vimeo\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch/i.test(href)) return href;
    }
    return null;
  }
  function findRawUrl(scope){
    var urlRe=/(https?:\/\/[^\s<>"']+)/i, nodes=qsa('p,div,span,li,figure', scope);
    for (var i=0;i<nodes.length;i++){ var html=nodes[i].innerHTML, m=html&&html.match(urlRe); if(m&&m[1]) return m[1]; }
    return null;
  }
  function injectIframe(scope, src){
    var ifr=document.createElement('iframe');
    ifr.src=src; ifr.allow='autoplay; encrypted-media; picture-in-picture; web-share';
    ifr.allowFullscreen=true; ifr.setAttribute('frameborder','0'); ifr.loading='lazy';
    ifr.style.cssText='display:block;visibility:visible;width:100%;max-width:100%;min-height:420px;border:0;margin:16px 0';
    scope.insertAdjacentElement('afterbegin', ifr);
    return ifr;
  }
  function scrubTinyPlaceholders(scope){
    qsa('figure, .wp-block-embed, .wp-embed-aspect-16-9, .fb-video, .fb-post, div', scope).forEach(function(node){
      var hasIframe=!!node.querySelector('iframe');
      var rect=node.getBoundingClientRect();
      var bg=getComputedStyle(node).backgroundColor;
      if (!hasIframe && rect.height<24 && (bg==='rgb(0, 0, 0)'||bg==='rgba(0, 0, 0, 1)')) node.remove();
    });
  }

  // Expose renderPostDetail if your main.js expects it
  if (!window.renderPostDetail) {
    window.renderPostDetail = function(post){
      var app=qs('#app'); if(!app) return;
      var author=(post && post._embedded && post._embedded.author && post._embedded.author[0] && post._embedded.author[0].name) || 'Oklahoma Observer';
      var dateStr=fmtDate(post && (post.date_gmt||post.date));

      var article=el('article','post-detail','');

      if (post && post._ok_img) {
        article.appendChild(el('figure','post-hero','<img class="post-hero-img" alt="" src="'+post._ok_img+'">'));
      }

      article.appendChild(el('h1','post-title', (post && post.title && post.title.rendered) || ''));
      article.appendChild(el('div','post-byline','<strong>'+author+'</strong> — '+dateStr));

      var body=el('section','post-body',(post && post.content && post.content.rendered) || '');
      article.appendChild(body);

      var nav=el('nav','post-nav','');
      var btn=el('button','back-to-posts','← Back to Posts');
      btn.type='button';
      btn.addEventListener('click', function(){ location.hash='#/posts'; });
      nav.appendChild(btn); article.appendChild(nav);

      app.innerHTML=''; app.appendChild(article);

      // 1) If an iframe already exists, make sure it’s visible and tall enough
      var existing=findExistingIframe(body);
      if (existing) normalizeIframe(existing);

      // 2) If there isn’t one, try to derive from data-oembed / anchors / raw text
      if (!existing){
        var src = toEmbedSrc(findDataOembed(body)) || toEmbedSrc(findAnchorUrl(body)) || toEmbedSrc(findRawUrl(body));
        if (src) normalizeIframe(injectIframe(body, src));
      }

      // 3) Clean up tiny black placeholders
      scrubTinyPlaceholders(body);

      // 4) Re-normalize after hero loads to fight CLS
      var hero=qs('.post-hero-img', article);
      if (hero) {
        if (hero.complete) { var i=findExistingIframe(body); if(i) normalizeIframe(i); }
        else hero.addEventListener('load', function(){ var i=findExistingIframe(body); if(i) normalizeIframe(i); }, {once:true});
      }

      // 5) If providers mutate the DOM, keep iframe normalized
      new MutationObserver(function(){ var i=findExistingIframe(body); if(i) normalizeIframe(i); })
        .observe(body, {childList:true, subtree:true, attributes:true});
    };
  }

  // Hard fallback for /post/381733 — add Vimeo player if still missing
  (function(){
    var m=(location.hash||'').match(/\/post\/(\d+)/);
    if(!m || m[1]!=='381733') return;
    var body=qs('.post-body'); if(!body) return;
    if (body.querySelector('iframe')) return;
    var html=body.innerHTML;
    var mm=html.match(/https?:\/\/(?:www\.)?vimeo\.com\/(\d{6,12})/i);
    if (mm && mm[1]) {
      var src='https://player.vimeo.com/video/'+mm[1];
      var ifr=injectIframe(body, src); normalizeIframe(ifr);
      console.log('[OkObserver] Forced Vimeo iframe for post 381733:', src);
    } else {
      console.warn('[OkObserver] Post 381733: no Vimeo id found in HTML; fallback not applied.');
    }
  })();

})();
 /* 🔴 PostDetail.js — END FULL FILE (2025-11-11R1) */
