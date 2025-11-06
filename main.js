/* 🟢 main.js */
/* OkObserver main.js — v=2025-11-06SR1-perfSWR1-hotfix3c
   Change: add `_embed=1` to summary fetch so featured images are present.
   Everything else stays the same (grid, caching, return-to-scroll, 1 fetch/page).
*/
(function(){
  "use strict";

  var VER   = (window.__OKO__ && window.__OKO__.VER) || "2025-11-06SR1-perfSWR1-hotfix3c";
  var DEBUG = !!(window.__OKO__ && window.__OKO__.DEBUG);

  var API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/";
  var PAGE_SIZE = 12;

  var metrics = { fetchPages: 0, postsReceived: 0, t0: performance.now() };
  function log(){ if (DEBUG) console.log.apply(console, arguments); }
  function time(l){ if (DEBUG) console.time(l); }
  function timeEnd(l){ if (DEBUG) console.timeEnd(l); }

  function el(s){ return document.querySelector(s); }
  function ce(t,c){ var n=document.createElement(t); if(c) n.className=c; return n; }

  var SS_LIST = "oko:list:v1";
  var SS_SCROLL = "oko:scrollTop:v1";
  var SS_PAGE = "oko:page:v1";

  window.addEventListener("hashchange", router);
  document.addEventListener("DOMContentLoaded", router);

  function deferIdle(fn){ (window.requestIdleCallback || function(cb){return setTimeout(cb,60)})(fn); }

  function imgEl(src, alt){
    var img = new Image();
    img.className = "oo-media";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = src;
    img.alt = alt || "";
    return img;
  }

  function isCartoon(post){
    if (!post || !post.categories) return false;
    var cats = post.categories;
    if (Array.isArray(cats)) {
      return cats.some(function(c){
        var s = String(c).toLowerCase();
        return s.includes("cartoon") || s === "1109" || s === "cartoons";
      });
    }
    return false;
  }

  var state = { page: 1, loading: false, done: false, list: [] };

  var gridObserver;
  function mountGridObserver(grid){
    if (gridObserver) { try{gridObserver.disconnect();}catch(e){} }
    gridObserver = new MutationObserver(function(){
      grid.style.display = "grid";
    });
    gridObserver.observe(grid, {childList:true, subtree:false});
  }

  // ===== Fetch posts (1 fetch per page) =====
  async function fetchPage(page){
    if (state.loading || state.done) return [];
    state.loading = true;
    var label = "fetchPage#" + page;
    time(label);
    metrics.fetchPages++;

    // IMPORTANT: request embedded objects so featured media arrives
    var url = API_BASE + "posts?per_page=" + PAGE_SIZE + "&page=" + page + "&_embed=1&orderby=date&order=desc";
    var res = await fetch(url, { credentials: "omit" });
    timeEnd(label);

    if (!res.ok) {
      state.loading = false;
      if (res.status === 400 || res.status === 404) {
        state.done = true; return [];
      }
      throw new Error("Network error " + res.status);
    }

    var posts = await res.json();
    metrics.postsReceived += posts.length;
    if (!posts.length) state.done = true;

    state.loading = false;
    return posts;
  }

  async function renderHome(){
    var app = el("#app"); app.innerHTML = "";
    var grid = ce("section","oo-grid"); app.appendChild(grid);
    mountGridObserver(grid);

    var cachedList = sessionStorage.getItem(SS_LIST);
    var cachedPage = sessionStorage.getItem(SS_PAGE);
    if (cachedList && cachedPage) {
      try {
        var list = JSON.parse(cachedList);
        state.list = list;
        state.page = parseInt(cachedPage, 10) || 1;
        list.forEach(function(p){ grid.appendChild(cardFromPost(p)); });
        deferIdle(function(){
          var y = parseFloat(sessionStorage.getItem(SS_SCROLL) || "0");
          if (!isNaN(y)) window.scrollTo(0, y);
        });
      } catch(_) {
        state.page = 1; state.done = false; state.list = [];
        await loadMore(grid);
      }
    } else {
      state.page = 1; state.done = false; state.list = [];
      await loadMore(grid);
    }

    var io = new IntersectionObserver(async function(entries){
      if (!entries.some(function(e){return e.isIntersecting})) return;
      await loadMore(grid);
    }, {rootMargin:"800px"});
    var sentinel = ce("div"); sentinel.style.height="1px";
    grid.appendChild(sentinel); io.observe(sentinel);

    window.addEventListener("beforeunload", function(){
      sessionStorage.setItem(SS_SCROLL, String(window.scrollY || 0));
    }, { once:true });
  }

  async function loadMore(grid){
    if (state.loading || state.done) return;
    var next = (state.page||0) + 1;
    if (state.list.length===0) next = 1;

    var posts = await fetchPage(next);
    posts = posts.filter(function(p){ return !isCartoon(p); });

    posts.forEach(function(p){
      state.list.push(p);
      grid.insertBefore(cardFromPost(p), grid.lastElementChild);
    });

    if (posts.length) {
      state.page = next;
      try {
        sessionStorage.setItem(SS_LIST, JSON.stringify(state.list));
        sessionStorage.setItem(SS_PAGE, String(state.page));
      } catch(e){}
    }
  }

  function cardFromPost(post){
    var card = ce("article","oo-card");
    var a = ce("a","oo-titlelink");
    a.href = "#/post/" + post.id;

    var mediaSrc = pickFeaturedImage(post);
    if (mediaSrc) a.appendChild(imgEl(mediaSrc, post.title && post.title.rendered || ""));

    var body = ce("div","oo-card-body");
    var title = ce("h2","oo-titletext");
    title.innerHTML = (post.title && post.title.rendered) || "Untitled";

    var meta = ce("div","oo-meta");
    var by = ce("span","oo-byline"); by.textContent = bylineFrom(post);
    var dt = ce("span","oo-date"); dt.textContent = dateFrom(post);
    meta.appendChild(by); meta.appendChild(dt);

    var tags = tagsFrom(post);
    tags.forEach(function(t){ var tag = ce("span","oo-tag"); tag.textContent = t; meta.appendChild(tag); });

    var excerpt = ce("p","oo-excerpt");
    excerpt.innerHTML = (post.excerpt && post.excerpt.rendered) || "";

    a.appendChild(body);
    body.appendChild(title); body.appendChild(meta); body.appendChild(excerpt);

    card.addEventListener("keydown", function(e){
      if (e.key === "Tab") card.classList.add("oo-focus");
    }, { once:true });

    card.appendChild(a);
    return card;
  }

  function textFromHTML(html){ var d=new DOMParser().parseFromString(html||"","text/html"); return d.body.textContent||""; }
  function bylineFrom(post){
    var a = (post._embedded && post._embedded.author && post._embedded.author[0] && post._embedded.author[0].name) || "The Oklahoma Observer";
    return a;
    }
  function dateFrom(post){
    try{ var d = new Date(post.date); return d.toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'});}catch(e){return "";}
  }
  function tagsFrom(post){
    var out=[];
    if (post._embedded && post._embedded["wp:term"] && post._embedded["wp:term"][1]) {
      post._embedded["wp:term"][1].forEach(function(t){ if(t && t.name) out.push(t.name); });
    }
    return out.slice(0,3);
  }
  function pickFeaturedImage(post){
    try{
      if (post._embedded && post._embedded["wp:featuredmedia"] && post._embedded["wp:featuredmedia"][0] && post._embedded["wp:featuredmedia"][0].source_url) {
        return post._embedded["wp:featuredmedia"][0].source_url + "?cb=" + post.id;
      }
      var d = new DOMParser().parseFromString(post.content && post.content.rendered || "", "text/html");
      var im = d.querySelector("img");
      if (im && im.src) return im.src + "?cb=" + post.id;
    }catch(e){}
    return "";
  }

  async function renderDetail(id){
    var app = el("#app");
    app.innerHTML = "<div style='padding:1rem'>Loading…</div>";
    time("fetchDetail#" + id);
    var res = await fetch(API_BASE + "posts/" + id + "?_embed=1");
    timeEnd("fetchDetail#" + id);
    if (!res.ok){ app.innerHTML = "<div style='padding:1rem'>Failed to load.</div>"; return; }
    var post = await res.json();

    var c = ce("article");
    var h = ce("h1"); h.textContent = textFromHTML(post.title && post.title.rendered || ""); c.appendChild(h);

    var mediaURL = pickFeaturedImage(post);
    if (mediaURL) c.appendChild(imgEl(mediaURL, h.textContent));

    var body = ce("div"); body.innerHTML = (post.content && post.content.rendered) || ""; c.appendChild(body);

    var back = ce("p");
    var a = ce("a"); a.textContent = "← Back to Posts"; a.href = "#/";
    a.style.color = "#1E90FF"; a.style.textDecoration = "none";
    back.appendChild(a); c.appendChild(back);

    app.innerHTML = ""; app.appendChild(c);
  }

  async function router(){
    var hash = location.hash || "#/";
    if (hash.startsWith("#/post/")) {
      var id = hash.split("/").pop();
      renderDetail(id);
    } else if (hash.startsWith("#/about")) {
      renderAbout();
    } else {
      renderHome();
    }
  }

  function renderAbout(){
    var app = el("#app");
    app.innerHTML = "<section class='oo-app'><h1>About The Oklahoma Observer</h1><p>Independent journalism for Oklahoma since 1969.</p></section>";
  }

  window.addEventListener("pagehide", function(){
    if (!DEBUG) return;
    var t = (performance.now() - metrics.t0).toFixed(1);
    console.log("[OkObserver] time=%sms fetchPages=%s posts=%s", t, metrics.fetchPages, metrics.postsReceived);
  });

})();
 /* 🔴 main.js */
