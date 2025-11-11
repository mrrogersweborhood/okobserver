/* 🟢 main.js — FULL FILE REPLACEMENT
   OkObserver Build 2025-11-10R6
   Keeps:
     - 4/3/1 grid (CSS-led; JS enforcer present)
     - Cartoon filter (WordPress CATEGORY only; slug or name contains "cartoon")
     - Featured image clickable on summary
     - One-network-fetch/page, infinite scroll with thin-batch auto-chaining
     - SW registration untouched
*/

(function () {
  'use strict';

  var BUILD = '2025-11-10R6';
  console.log('[OkObserver] Main JS Build', BUILD);

  var API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  var PER_PAGE = 12;
  var CARTOON_SLUGS = ['cartoon', 'cartoons'];
  var ROUTES = { HOME:'#/posts', POST:'#/post/' };
  var SCROLL_KEY = 'okobs.return.scrollY';

  function qs(s, r){ return (r||document).querySelector(s); }
  function el(t,c,html){ var n=document.createElement(t); if(c) n.className=c; if(html!=null) n.innerHTML=html; return n; }

  var state = {
    page: 0,
    posts: [],
    loading: false,
    done: false
  };

  // Router
  window.addEventListener('hashchange', router);
  document.addEventListener('DOMContentLoaded', router);

  function router(){
    var h = location.hash || ROUTES.HOME;
    if (h.indexOf(ROUTES.POST) === 0) {
      renderPostDetail(parseInt(h.replace(ROUTES.POST,''),10));
      return;
    }
    renderHome(true);
  }

  // HTTP helpers
  function wp(endpoint, params){
    var url = API + endpoint;
    if (params){
      var q = Object.keys(params).map(function(k){ return encodeURIComponent(k)+'='+encodeURIComponent(params[k]); }).join('&');
      url += (url.indexOf('?')===-1?'?':'&') + q;
    }
    return fetch(url).then(function(r){
      if (!r.ok) throw new Error('HTTP '+r.status);
      var link = r.headers.get('Link') || r.headers.get('link') || '';
      var more = /rel="next"/i.test(link);
      return r.json().then(function(json){ return {json:json, more:more}; });
    });
  }

  function fetchPosts(pageNum){
    return wp('/posts', {_embed:1, per_page:PER_PAGE, page:pageNum, order:'desc', orderby:'date', status:'publish'})
      .then(function(res){ state.done = !res.more; return res.json||[]; });
  }

  function fetchPost(id){
    return wp('/posts/'+id, {_embed:1}).then(function(res){ return res.json; });
  }

  // Data mapping / filters
  function getFeatured(post){
    try{
      var m = post._embedded && post._embedded['wp:featuredmedia'];
      if (m && m[0] && m[0].source_url) return m[0].source_url + '?cb=' + post.id;
    }catch(e){}
    return '';
  }

  function isCartoon(post){
    // Prefer embedded categories (_embedded['wp:term'][0])
    try{
      var cats = (post._embedded && post._embedded['wp:term'] && post._embedded['wp:term'][0]) || [];
      for (var i=0;i<cats.length;i++){
        var slug = (cats[i].slug||'').toLowerCase();
        var name = (cats[i].name||'').toLowerCase();
        if (CARTOON_SLUGS.indexOf(slug)!==-1) return true;
        if (name.indexOf('cartoon')!==-1) return true;
      }
    }catch(e){}
    return false;
  }

  // Summary UI
  function headerHTML(){
    return '' +
      '<header class="topbar">' +
        '<div class="brand">' +
          '<img src="logo.png" alt="The Oklahoma Observer" class="brand-logo" />' +
          '<div class="brand-motto">To comfort the afflicted and afflict the comfortable</div>' +
        '</div>' +
        '<button class="hamburger" aria-label="menu" onclick="document.body.classList.toggle(\'menu-open\')">≡</button>' +
        '<nav class="mainnav"><a href="'+ROUTES.HOME+'">Posts</a><a href="#/about">About</a></nav>' +
      '</header>';
  }

  function footerHTML(){ return '<footer class="site-footer">© 2025 The Oklahoma Observer • Build '+BUILD+'</footer>'; }

  function postCard(post){
    var card = el('article','post-card','');
    var img = getFeatured(post);
    if (img){
      card.innerHTML += '<a class="card-image" href="'+ROUTES.POST+post.id+'"><img src="'+img+'" alt=""></a>';
    }
    card.innerHTML +=
      '<h2 class="card-title"><a href="'+ROUTES.POST+post.id+'">'+ (post.title&&post.title.rendered||'') +'</a></h2>' +
      '<div class="card-byline"><strong>Oklahoma Observer</strong> — '+ niceDate(post.date) +'</div>' +
      '<div class="card-excerpt">'+ (post.excerpt&&post.excerpt.rendered||'') +'</div>';
    return card;
  }

  // Grid enforcer (if CSS races)
  function enforceGrid(g){
    g.style.display = 'grid';
    g.style.gridGap = '16px';
    function setCols(){
      var w = g.clientWidth || window.innerWidth;
      var cols = w>=1200?4:(w>=800?3:1);
      g.style.gridTemplateColumns = 'repeat('+cols+', minmax(0,1fr))';
    }
    setCols();
    window.addEventListener('resize', setCols);
  }

  // Home render + infinite scroll
  var io;
  function renderHome(initial){
    // save/restore scroll around route changes
    if (location.hash.startsWith(ROUTES.POST)) {
      try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY||0)); } catch(e){}
    }

    var app = qs('#app');
    app.innerHTML = headerHTML() +
      '<main id="home"><div id="grid" class="posts-grid"></div><div id="feedSentinel" aria-hidden="true" style="height:1px"></div></main>' +
      footerHTML();

    var grid = qs('#grid');
    enforceGrid(grid);

    // Fill from current state
    state.posts.forEach(function(p){ grid.appendChild(postCard(p)); });

    if (initial){
      // restore return-to-scroll
      var y = +sessionStorage.getItem(SCROLL_KEY) || 0;
      if (y>0) requestAnimationFrame(function(){ window.scrollTo(0,y); });

      if (state.page===0 && !state.loading && !state.done) loadMore();
    }

    ensureInfinite();
    rearmInfinite();
  }

  function ensureInfinite(){
    if (io || state.done) return;
    var sentinel = qs('#feedSentinel');
    io = new IntersectionObserver(function(ents){
      ents.forEach(function(e){ if (e.isIntersecting) loadMore(); });
    }, { rootMargin:'1200px 0px 1200px 0px', threshold:0.01 });
    io.observe(sentinel);
  }

  function rearmInfinite(){
    var s = qs('#feedSentinel'); if (!s) return;
    if (!io) { ensureInfinite(); return; }
    try { io.unobserve(s); } catch(e){}
    io.observe(s);
  }

  function loadMore(){
    if (state.loading || state.done) return;
    state.loading = true;
    var next = state.page + 1;

    fetchPosts(next).then(function(rows){
      rows.forEach(function(p){ p._ok_img = getFeatured(p); });
      var filtered = rows.filter(function(p){ return !isCartoon(p); });

      var grid = qs('#grid');
      filtered.forEach(function(p){ state.posts.push(p); grid.appendChild(postCard(p)); });
      state.page = next;

      var THRESHOLD = Math.max(4, Math.floor(PER_PAGE*0.5));
      if (!state.done && filtered.length < THRESHOLD) {
        Promise.resolve().then(function(){ loadMore(); });
      } else {
        rearmInfinite();
      }
    }).catch(function(err){
      console.warn('[OkObserver] loadMore failed', err);
      rearmInfinite();
    }).finally(function(){ state.loading = false; });
  }

  // Detail route (delegates to PostDetail.js)
  function renderPostDetail(id){
    var app = qs('#app');
    app.innerHTML = headerHTML() + '<main id="detail"><div class="post-body">Loading…</div></main>' + footerHTML();

    fetchPost(id).then(function(post){
      post._ok_img = getFeatured(post);
      if (window.renderPostDetail) window.renderPostDetail(post);
      else app.querySelector('.post-body').innerHTML = (post.content && post.content.rendered) || 'Post loaded.';
    }).catch(function(){
      app.querySelector('.post-body').textContent = 'Post not found.';
    });
  }

  // Utils
  function niceDate(iso){
    try { var d=new Date(iso); return d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); }
    catch(e){ return iso; }
  }

})();
 /* 🔴 main.js — END FULL FILE */
