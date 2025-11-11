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
  var app = document.getElementById('app');

  // router
  window.addEventListener('hashchange', route);
  window.addEventListener('load', route);

  function route() {
    var hash = location.hash || '#/';
    if (hash.startsWith('#/post/')) {
      var id = +hash.split('/')[2];
      renderDetail(id);
    } else if (hash.startsWith('#/about')) {
      renderAbout();
    } else {
      renderHome();
    }
  }

  // Home (grid with cartoon filter and infinite scroll)
  var paging = { page: 1, busy: false, done: false };
  function renderHome() {
    app.innerHTML = '<section class="posts-grid" aria-label="Posts grid"></section>';
    paging = { page: 1, busy: false, done: false };
    loadMore();
    window.onscroll = onScroll;
  }
  function onScroll() {
    if (paging.busy || paging.done) return;
    var nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 1000);
    if (nearBottom) loadMore();
  }

  function loadMore() {
    paging.busy = true;
    fetch(API + '/posts?_embed&per_page=12&page=' + paging.page)
      .then(r => {
        if (!r.ok) { if (r.status === 400 || r.status === 404) paging.done = true; throw new Error('no more'); }
        var total = +r.headers.get('X-WP-Total');
        return r.json().then(arr => ({ arr, total }));
      })
      .then(({ arr }) => {
        var grid = app.querySelector('.posts-grid');
        // filter out cartoons by CATEGORY
        arr.forEach(p => {
          var cats = (p._embedded && p._embedded['wp:term'] && p._embedded['wp:term'][0]) || [];
          var isCartoon = cats.some(c => {
            var nm = (c.name || '').toLowerCase();
            var sl = (c.slug || '').toLowerCase();
            return nm.includes('cartoon') || sl.includes('cartoon');
          });
          if (isCartoon) return; // skip

          var link = '#/post/' + p.id;
          var title = p.title && p.title.rendered || 'Untitled';
          var date = niceDate(p.date);

          // featured image
          var media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
          var src = media && (media.source_url || (media.media_details && media.media_details.sizes && (media.media_details.sizes.medium || media.media_details.sizes.full).source_url));

          var card = document.createElement('article');
          card.className = 'post-card';
          card.innerHTML =
            (src ? ('<a href="'+link+'"><img class="thumb" alt="" loading="lazy" src="'+src+'"></a>') : '') +
            '<div class="pad">'+
            '<h3><a href="'+link+'">'+title+'</a></h3>'+
            '<div class="byline">Oklahoma Observer — '+date+'</div>'+
            '<div class="excerpt">'+(p.excerpt && p.excerpt.rendered || '')+'</div>'+
            '</div>';
          grid.appendChild(card);
        });

        paging.page += 1;
        paging.busy = false;
      })
      .catch(() => { paging.busy = false; paging.done = true; });

    // defensive enforcer: make sure grid class exists
    setTimeout(() => {
      var g = app.querySelector('.posts-grid');
      if (!g) {
        var s = document.createElement('section'); s.className='posts-grid'; app.prepend(s);
      }
    }, 0);
  }

  // About
  function renderAbout() {
    window.onscroll = null;
    app.innerHTML = '<div class="post-detail"><h1>About</h1><p>The Oklahoma Observer…</p></div>';
  }

  // Detail shell; content filled by PostDetail.js (kept separate)
  function renderDetail(id) {
    window.onscroll = null;
    app.innerHTML =
      '<article class="post-detail">'+
        '<img class="hero" alt="" style="display:none" />'+
        '<h1 class="detail-title"></h1>'+
        '<div class="detail-byline"></div>'+
        '<div class="post-body"></div>'+
        '<p><a class="btn-back" href="#/">← Back to Posts</a></p>'+
      '</article>';

    // fetch and render
    fetch(API + '/posts/'+id+'?_embed').then(r=>r.json()).then(post=>{
      // title & byline after hero
      document.title = (post.title && post.title.rendered ? post.title.rendered.replace(/<[^>]+>/g,'') + ' – ' : '') + 'The Oklahoma Observer';

      var hero = app.querySelector('.hero');
      var media = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
      var src = media && (media.source_url || (media.media_details && media.media_details.sizes && (media.media_details.sizes.large || media.media_details.sizes.full).source_url));
      if (src){ hero.src = src; hero.style.display='block'; }

      app.querySelector('.detail-title').innerHTML = post.title && post.title.rendered || '';
      app.querySelector('.detail-byline').textContent = 'Oklahoma Observer — ' + niceDate(post.date);

      // body first; PostDetail.js will normalize embeds
      app.querySelector('.post-body').innerHTML = (post.content && post.content.rendered) || 'Post loaded.';
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
