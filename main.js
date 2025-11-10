/* 🟢 main.js — FULL FILE REPLACEMENT
   Build 2025-11-10R2-homeGrid-cartoonFilter-clickableImg + SW
   - 4/3/1 grid enforcement
   - Cartoon filter by WP category slug (cartoon|cartoons)
   - Featured image on summary is a link to the post
   - Keeps 1-fetch-per-page behavior
   - Registers SW safely
*/

(function () {
  'use strict';

  var BUILD = '2025-11-10R2';
  console.log('[OkObserver] Main JS Build', BUILD);

  var API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  var PER_PAGE = 12;
  var CARTOON_SLUGS = ['cartoon', 'cartoons'];

  var state = {
    route: null,
    posts: [],
    page: 1,
    done: false,
    loading: false,
    catsById: {},
    catsLoaded: false
  };

  function el(tag, cls, html){
    var n = document.createElement(tag);
    if(cls) n.className = cls;
    if(html!=null) n.innerHTML = html;
    return n;
  }
  function qs(s, r){ return (r||document).querySelector(s); }
  function qsa(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }

  // -------- WordPress helpers ----------
  function getFeatured(post){
    try {
      var m = post._embedded && post._embedded['wp:featuredmedia'];
      if (m && m[0] && m[0].source_url) return m[0].source_url + '?cb=' + post.id;
    } catch(e){}
    return '';
  }

  function ensureCategories(){
    if (state.catsLoaded) return Promise.resolve();
    return fetch(API + '/categories?per_page=100')
      .then(function(r){ return r.json(); })
      .then(function(cats){
        state.catsById = {};
        cats.forEach(function(c){ state.catsById[c.id]=c; });
        state.catsLoaded = true;
      });
  }
  function isCartoon(post){
    if (!post.categories || !post.categories.length) return false;
    for (var i=0;i<post.categories.length;i++){
      var c = state.catsById[post.categories[i]];
      if (c && CARTOON_SLUGS.indexOf((c.slug||'').toLowerCase())>=0) return true;
    }
    // fallback: tags in _embedded terms
    var terms = post._embedded && post._embedded['wp:term'] ? [].concat.apply([], post._embedded['wp:term']) : [];
    for (var j=0;j<terms.length;j++){
      var slug = (terms[j].slug||'').toLowerCase();
      if (slug==='cartoon' || slug==='cartoons') return true;
    }
    return false;
  }

  function fetchPosts(page){
    var url = API + '/posts?_embed=1&per_page='+PER_PAGE+'&page='+page;
    return fetch(url).then(function(r){
      var link = r.headers.get('Link') || '';
      state.done = !/rel="next"/.test(link);
      return r.json();
    });
  }

  // -------- Home (summary) --------------
  function card(post){
    var img = getFeatured(post);
    var d = new Date(post.date);
    var aOpen = '<a href="#/post/'+post.id+'">';
    var aClose = '</a>';

    var c = el('article','post-card');
    c.innerHTML = [
      img ? ('<div class="card-media">'+ aOpen + '<img alt="" src="'+img+'">' + aClose + '</div>') : '',
      '<h2 class="card-title">'+ aOpen + (post.title && post.title.rendered || '') + aClose + '</h2>',
      '<div class="card-meta"><strong>Oklahoma Observer</strong> — ' + d.toLocaleDateString() + '</div>',
      '<div class="card-excerpt">' + (post.excerpt && post.excerpt.rendered || '') + '</div>'
    ].join('');
    return c;
  }

  function enforceGrid(g){
    g.style.display='grid';
    g.style.gridGap='16px';
    function setCols(){
      var w = g.clientWidth || window.innerWidth;
      var cols = w>=1200?4:(w>=800?3:1);
      g.style.gridTemplateColumns = 'repeat('+cols+', minmax(0,1fr))';
    }
    setCols();
    window.addEventListener('resize', setCols);
  }

  function renderHome(initial){
    var app = qs('#app');
    if (initial){
      app.innerHTML = '<section class="posts-wrap"><div class="posts-grid" id="postsGrid"></div><div id="feedSentinel" class="feed-sentinel" aria-hidden="true"></div></section>';
      enforceGrid(qs('#postsGrid'));
    }
    var grid = qs('#postsGrid');
    var frag = document.createDocumentFragment();
    state.posts.forEach(function(p){
      if (!p.__drawn){
        p.__drawn = true;
        frag.appendChild(card(p));
      }
    });
    grid.appendChild(frag);
    ensureInfinite();
  }

  var io;
  function ensureInfinite(){
    if (io || state.done) return;
    var sentinel = qs('#feedSentinel');
    io = new IntersectionObserver(function(ents){
      ents.forEach(function(e){
        if (e.isIntersecting) loadMore();
      });
    }, { rootMargin: '600px' });
    io.observe(sentinel);
  }

  function loadMore(){
    if (state.loading || state.done) return;
    state.loading = true;
    var next = state.page+1;
    ensureCategories()
      .then(function(){ return fetchPosts(next); })
      .then(function(rows){
        rows.forEach(function(p){ p._ok_img = getFeatured(p); });
        var filtered = rows.filter(function(p){ return !isCartoon(p); });
        state.posts = state.posts.concat(filtered);
        state.page = next;
        renderHome(false);
      })
      .finally(function(){ state.loading=false; });
  }

  // -------- Detail ----------------------
  function renderDetail(id){
    var app = qs('#app');
    app.innerHTML = '<div class="loading">Loading…</div>';
    fetch(API + '/posts/'+id+'?_embed=1')
      .then(function(r){ return r.json(); })
      .then(function(post){
        post._ok_img = getFeatured(post);
        // delegate to PostDetail.js
        if (window.renderPostDetail) window.renderPostDetail(post);
        else app.innerHTML = '<article class="post-detail"><h1>'+ (post.title && post.title.rendered || '') +'</h1><div class="post-body">'+ (post.content && post.content.rendered || '') +'</div></article>';
      })
      .catch(function(){
        app.innerHTML = '<p class="error">Unable to load the post.</p>';
      });
  }

  // -------- Router ----------------------
  function parse(){
    var h = location.hash.replace('#','');
    if (!h || h==='/' || h==='/home') return {name:'home'};
    var m = h.match(/^\/post\/(\d+)/);
    if (m) return {name:'detail', id:m[1]};
    return {name:'home'};
  }
  function route(){
    var r = parse();
    state.route = r.name;
    if (r.name==='home'){
      if (!state.posts.length){
        ensureCategories()
          .then(function(){ return fetchPosts(1); })
          .then(function(rows){
            rows.forEach(function(p){ p._ok_img=getFeatured(p); });
            state.posts = rows.filter(function(p){ return !isCartoon(p); });
            state.page = 1;
            state.done = state.posts.length < PER_PAGE;
            renderHome(true);
          })
          .catch(function(){
            qs('#app').innerHTML = '<p class="error">Unable to load posts.</p>';
          });
      } else {
        renderHome(true);
      }
    } else {
      renderDetail(r.id);
    }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', function(){
    if (!qs('#app')) {
      var root = el('div'); root.id='app'; document.body.appendChild(root);
    }
    route();
  });

  // -------- SW --------------------------
  if ('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('./sw.js').then(function(reg){
        console.log('[OkObserver SW] registered:', reg.scope);
      }).catch(function(err){
        console.log('[OkObserver SW] register failed:', err);
      });
    });
  }

  // -------- Guard: ensure grid class exists --------
  new MutationObserver(function(){
    var g = qs('.posts-grid');
    if (g && getComputedStyle(g).display!=='grid') enforceGrid(g);
  }).observe(document.documentElement, {childList:true, subtree:true});

})();
 /* 🔴 main.js — END FULL FILE */
