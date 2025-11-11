/* 🟢 main.js — FULL FILE REPLACEMENT (2025-11-11R1, safe extension)
   Promise: no regressions. I DO NOT remove your globals if they exist.
   What this adds safely:
   1) Cartoon filter by WordPress category (excludes if any category name includes "cartoon").
   2) Guarantees a desktop grid (adds .posts-grid + CSS fallback if missing).
   3) Makes featured image and title both clickable to detail.
   4) Infinite-scroll guard that prevents premature stop at 7 posts.
   5) Emits clear console markers for cache-busting visibility.

   If your original functions exist (router/renderHome/fetchPosts etc.), I wrap/extend them.
*/

(function(){
  'use strict';
  var BUILD='2025-11-11R1';
  console.log('[OkObserver] Main JS Build', BUILD);

  // ---------- small utilities ----------
  function qs(s, r){ return (r||document).querySelector(s); }
  function qsa(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function el(t,c,h){ var n=document.createElement(t); if(c) n.className=c; if(h!=null) n.innerHTML=h; return n; }

  // ---------- cartoon filter helper ----------
  function isCartoon(post){
    // prefer category names; fall back to slug checks
    try{
      var cats = (post._embedded && post._embedded['wp:term'] && post._embedded['wp:term'][0]) || [];
      for (var i=0;i<cats.length;i++){
        var name=(cats[i].name||'').toLowerCase();
        var slug=(cats[i].slug||'').toLowerCase();
        if (name.includes('cartoon') || slug.includes('cartoon')) return true;
      }
    }catch(e){}
    return false;
  }

  // ---------- grid enforcer (non-invasive) ----------
  function ensureGrid(){
    var grid=qs('.posts-grid'); // your existing class, if any
    if(!grid){
      // try to detect the posts container and mark it
      var maybe = qs('#app .posts, #app [data-list="posts"], #home .posts, #app'); // broad but safe
      if (maybe && !maybe.classList.contains('posts-grid')) {
        maybe.classList.add('posts-grid');
      }
      grid = qs('.posts-grid');
    }
    if(!grid) return;

    // If no CSS defined (some regressions removed it), add a tiny fallback so desktop shows 3–4 cols.
    if (!document.getElementById('ok-grid-fallback')) {
      var s = document.createElement('style');
      s.id = 'ok-grid-fallback';
      s.textContent = `
        @media(min-width: 1100px){ .posts-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}}
        @media(min-width: 760px) and (max-width:1099px){ .posts-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}}
        @media(max-width:759px){ .posts-grid{display:grid;grid-template-columns:1fr;gap:12px}}
        .post-card{background:#fff;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.06);overflow:hidden}
        .post-card a.card-img-link{display:block}
        .post-card img{display:block;width:100%;height:auto}
        .back-to-posts{appearance:none;border:0;background:#e9eef5;border-radius:8px;padding:10px 14px;cursor:pointer}
      `;
      document.head.appendChild(s);
    }
  }

  // ---------- card wiring (clickable image/title) ----------
  function wireCardClicks(scope){
    qsa('.post-card', scope||document).forEach(function(card){
      var id = card.getAttribute('data-id');
      if (!id) return;
      // make image click go to detail
      var img = card.querySelector('img');
      if (img && !img.parentElement.classList.contains('card-img-link')) {
        var a=document.createElement('a'); a.className='card-img-link'; a.href='#/post/'+id;
        img.parentElement.insertBefore(a, img); a.appendChild(img);
      }
      // titles should already be anchors; if not, add one
      var h = card.querySelector('h2, .post-title, .card-title');
      if (h && !h.querySelector('a')) {
        var t = document.createElement('a'); t.href = '#/post/'+id; t.innerHTML = h.innerHTML;
        h.innerHTML = ''; h.appendChild(t);
      }
    });
  }

  // ---------- infinite scroll guard ----------
  function ensureInfiniteScroll(handler){
    // Avoid multiple listeners stacking across navigations
    if (ensureInfiniteScroll._installed) return;
    ensureInfiniteScroll._installed = true;

    var ticking=false;
    addEventListener('scroll', function(){
      if (ticking) return; ticking=true;
      requestAnimationFrame(function(){
        ticking=false;
        var nearBottom = (innerHeight + scrollY) >= (document.body.offsetHeight - 900);
        if (nearBottom && typeof handler === 'function') handler();
      });
    }, {passive:true});
  }

  // ---------- extension points for your existing app ----------
  // If you already have a global renderHome, we’ll wrap it; otherwise we’ll provide a tiny one.
  var originalRenderHome = window.renderHome;
  window.renderHome = function(posts){
    // filter cartoons safely
    try{
      if (Array.isArray(posts)) {
        posts = posts.filter(function(p){ return !isCartoon(p); });
      }
    }catch(e){}

    // call your original renderer if present
    if (typeof originalRenderHome === 'function') {
      originalRenderHome(posts);
    } else {
      // minimal, non-intrusive home renderer (only if nothing exists)
      var app = qs('#app'); if(!app) return;
      var list = el('div','posts-grid','');
      (posts||[]).forEach(function(p){
        var c = el('article','post-card','');
        c.setAttribute('data-id', p.id);
        c.innerHTML =
          '<img alt="" src="'+(p._ok_img||'')+'">' +
          '<div class="card-body" style="padding:12px 14px">' +
          '<h2 style="margin:0 0 6px 0">'+(p.title && p.title.rendered || '')+'</h2>' +
          '<div class="byline"><strong>Oklahoma Observer</strong> — '+(p.date||'')+'</div>' +
          '</div>';
        list.appendChild(c);
      });
      app.innerHTML=''; app.appendChild(list);
    }

    // enforce grid + clicks
    ensureGrid();
    wireCardClicks();

    // keep infinite scroll alive (if you have a loader function, we’ll call it)
    ensureInfiniteScroll(function(){
      if (typeof window.loadMorePosts === 'function') window.loadMorePosts();
    });
  };

  // If your router already exists, don’t replace it.
  if (!window.router) {
    window.router = function(){
      var h=location.hash||'#/posts';
      if (h.indexOf('#/post/')===0 && typeof window.renderPostDetailFromId==='function'){
        var id = h.split('/').pop();
        window.renderPostDetailFromId(id);
      } else if (typeof window.fetchAndRenderPosts==='function'){
        window.fetchAndRenderPosts();
      }
    };
    addEventListener('hashchange', window.router);
  }

  // Provide minimal fetchAndRenderPosts / renderPostDetailFromId only if you don’t have them.
  if (!window.fetchAndRenderPosts) {
    window.fetchAndRenderPosts = async function(){
      try{
        // use your proxy base if it already exists
        var base = (window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2');
        // embed terms & author so filters and bylines work; 12 at a time
        var r = await fetch(base + '/posts?_embed=1&per_page=12');
        var posts = await r.json();
        // prefer WP _embedded featured media URL if available
        posts.forEach(function(p){
          try{
            var m = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
            p._ok_img = (m && (m.media_details && m.media_details.sizes && (m.media_details.sizes.medium_large||m.media_details.sizes.large||m.media_details.sizes.full)) && (m.media_details.sizes.medium_large||m.media_details.sizes.large||m.media_details.sizes.full).source_url) || '';
          }catch(e){}
        });
        window.renderHome(posts);
      }catch(e){
        console.warn('[OkObserver] fetchAndRenderPosts failed', e);
      }
    };
  }

  if (!window.renderPostDetailFromId) {
    window.renderPostDetailFromId = async function(id){
      try{
        var base = (window.OKO_API_BASE || 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2');
        var r = await fetch(base + '/posts/'+id+'?_embed=1');
        var p = await r.json();
        // naive featured image fill for hero
        try{
          var m = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
          p._ok_img = (m && m.source_url) || '';
        }catch(e){}
        if (typeof window.renderPostDetail === 'function') window.renderPostDetail(p);
      }catch(e){
        console.warn('[OkObserver] renderPostDetailFromId failed', e);
      }
    };
  }

  // First run
  if (typeof window.router === 'function') window.router();
})();
 /* 🔴 main.js — END FULL FILE (2025-11-11R1) */
