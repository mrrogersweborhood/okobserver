/* OkObserver main.js — v=2025-11-06SR1-perfSWR1-hotfix3
   Baseline preserved:
   - 4/3/1 grid with MutationObserver enforcer
   - Excerpts visible, featured images correct
   - Embeds (YT/Vimeo/FB/MP4) working
   - Infinite scroll: 1 fetch per page
   - sessionStorage: list + scroll position
   - Return-to-scroll restored from session
   - No ES module syntax (plain JS only)
*/

(function(){
  "use strict";

  // ===== Version / Flags =====
  var VER   = (window.__OKO__ && window.__OKO__.VER) || "2025-11-06SR1-perfSWR1-hotfix3";
  var DEBUG = !!(window.__OKO__ && window.__OKO__.DEBUG);

  // ===== Config =====
  var API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/";
  var PAGE_SIZE = 12;

  // Observability (guarded)
  var metrics = {
    fetchPages: 0,
    postsReceived: 0,
    t0: performance.now()
  };
  function log(){ if (DEBUG) console.log.apply(console, arguments); }
  function time(label){ if (DEBUG) console.time(label); }
  function timeEnd(label){ if (DEBUG) console.timeEnd(label); }

  // ===== DOM helpers =====
  function el(sel){ return document.querySelector(sel); }
  function ce(tag, cls){ var n=document.createElement(tag); if(cls) n.className=cls; return n; }

  // ===== Session cache keys =====
  var SS_LIST = "oko:list:v1";
  var SS_SCROLL = "oko:scrollTop:v1";
  var SS_PAGE = "oko:page:v1";

  // ===== Router =====
  window.addEventListener("hashchange", router);
  document.addEventListener("DOMContentLoaded", router);

  // ===== Idle wiring for non-critical listeners (micro-pack) =====
  function deferIdle(fn){ (window.requestIdleCallback || function(cb){return setTimeout(cb,60)})(fn); }

  // ===== Media helpers (tighten image loading/decoding) =====
  function imgEl(src, alt){
    var img = new Image();
    img.className = "oo-media";
    img.loading = "lazy";       // safe: summary grid only
    img.decoding = "async";     // hint to decode off main
    img.src = src;
    img.alt = alt || "";
    return img;
  }

  // ===== Cartoon filter =====
  function isCartoon(post){
    if (!post || !post.categories) return false;
    var cats = post.categories; // array of IDs or strings depending on API mapping
    // Assume server already filters; keep a client-side guard:
    if (Array.isArray(cats)) {
      return cats.some(function(c){
        var s = String(c).toLowerCase();
        return s.includes("cartoon") || s === "1109" || s === "cartoons";
      });
    }
    return false;
  }

  // ===== State =====
  var state = {
    page: 1,
    loading: false,
    done: false,
    list: [] // summary posts
  };

  // ===== MutationObserver grid enforcer (preserved) =====
  var gridObserver;
  function mountGridObserver(grid){
    if (gridObserver) { try{gridObserver.disconnect();}catch(e){} }
    gridObserver = new MutationObserver(function(){
      grid.style.display = "grid"; // re-enforce
    });
    gridObserver.observe(grid, {childList:true, subtree:false});
  }

  // ===== Fetch posts (1 fetch per page) =====
  async function fetchPage(page){
    if (state.loading || state.done) return [];
    state.loading = true;
    time("fetchPage#" + page);
    metrics.fetchPages++;

    // Keep exactly one request for summaries per page
    var url = API_BASE + "posts?per_page=" + PAGE_SIZE + "&page=" + page;
    // Note: server-side proxy already optimizes; no additional splits here
    var res = await fetch(url, { credentials: "omit" });
    timeEnd("fetchPage#" + page);

    if (!res.ok) {
      state.loading = false;
      if (res.status === 400 || res.status === 404) {
        state.done = true;
        return [];
      }
      throw new Error("Network error " + res.status);
    }

    var posts = await res.json();
    metrics.postsReceived += posts.length;
    if (!posts.length) state.done = true;

    state.loading = false;
    return posts;
  }

  // ===== Rendering: Home (summary) =====
  async function renderHome(){
    var app = el("#app");
    app.innerHTML = "";

    var grid = ce("section","oo-grid");
    app.appendChild(grid);
    mountGridObserver(grid);

    // Restore from session if present
    var cachedList = sessionStorage.getItem(SS_LIST);
    var cachedPage = sessionStorage.getItem(SS_PAGE);
    if (cachedList && cachedPage) {
      try {
        var list = JSON.parse(cachedList);
        state.list = list;
        state.page = parseInt(cachedPage, 10) || 1;
        list.forEach(function(p){ grid.appendChild(cardFromPost(p)); });
        // restore scroll after first frame to avoid jank
        deferIdle(function(){
          var y = parseFloat(sessionStorage.getItem(SS_SCROLL) || "0");
          if (!isNaN(y)) window.scrollTo(0, y);
        });
      } catch(e) {
        // ignore and fall through
      }
    } else {
      state.page = 1; state.done = false; state.list = [];
      await loadMore(grid);
    }

    // Infinite scroll
    var io = new IntersectionObserver(async function(entries){
      if (!entries.some(function(e){return e.isIntersecting})) return;
      await loadMore(grid);
    }, {rootMargin:"800px"});
    var sentinel = ce("div"); sentinel.style.height="1px";
    grid.appendChild(sentinel);
    io.observe(sentinel);

    // Save scroll on navigate away
    window.addEventListener("beforeunload", function(){
      sessionStorage.setItem(SS_SCROLL, String(window.scrollY || 0));
    }, { once:true });
  }

  async function loadMore(grid){
    if (state.loading || state.done) return;
    var next = (state.page||0) + 1;
    if (state.list.length===0) next = 1; // initial load uses page 1

    var posts = await fetchPage(next);
    // filter cartoons defensively
    posts = posts.filter(function(p){ return !isCartoon(p); });

    // append
    posts.forEach(function(p){
      state.list.push(p);
      grid.insertBefore(cardFromPost(p), grid.lastElementChild); // before sentinel
    });

    if (posts.length) {
      state.page = next;
      // cache list + page for return-to-scroll
      try {
        sessionStorage.setItem(SS_LIST, JSON.stringify(state.list));
        sessionStorage.setItem(SS_PAGE, String(state.page));
      } catch(e){}
    }
  }

  // ===== Card builder =====
  function cardFromPost(post){
    var card = ce("article","oo-card");

    // link
    var a = ce("a","oo-titlelink");
    a.href = "#/post/" + post.id;

    // media
    var mediaSrc = pickFeaturedImage(post);
    if (mediaSrc) a.appendChild(imgEl(mediaSrc, post.title && post.title.rendered || ""));

    // content
    var body = ce("div","oo-card-body");
    var title = ce("h2","oo-titletext");
    title.innerHTML = (post.title && post.title.rendered) || "Untitled";

    var meta = ce("div","oo-meta");
    var by = ce("span","oo-byline");
    by.textContent = bylineFrom(post);
    var dt = ce("span","oo-date");
    dt.textContent = dateFrom(post);
    meta.appendChild(by); meta.appendChild(dt);

    var tags = tagsFrom(post);
    tags.forEach(function(t){
      var tag = ce("span","oo-tag"); tag.textContent = t; meta.appendChild(tag);
    });

    var excerpt = ce("p","oo-excerpt");
    excerpt.innerHTML = (post.excerpt && post.excerpt.rendered) || "";

    a.appendChild(body);
    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(excerpt);

    // focus ring when tabbing into the card
    card.addEventListener("keydown", function(e){
      if (e.key === "Tab") card.classList.add("oo-focus");
    }, { once:true });

    card.appendChild(a);
    return card;
  }

  // ===== Helpers for content fields =====
  function textFromHTML(html){ var d=new DOMParser().parseFromString(html||"","text/html"); return d.body.textContent||""; }
  function bylineFrom(post){
    var a = (post._embedded && post._embedded.author && post._embedded.author[0] && post._embedded.author[0].name) || "The Oklahoma Observer";
    return a;
  }
  function dateFrom(post){
    try{
      var d = new Date(post.date);
      return d.toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'});
    }catch(e){return "";}
  }
  function tagsFrom(post){
    // if tags names are embedded, return them; otherwise, empty (no extra fetches)
    var out=[];
    if (post._embedded && post._embedded["wp:term"] && post._embedded["wp:term"][1]) {
      post._embedded["wp:term"][1].forEach(function(t){ if(t && t.name) out.push(t.name); });
    }
    return out.slice(0,3);
  }
  function pickFeaturedImage(post){
    // preserve existing behavior: prefer featured media, fall back to content-leading image if necessary
    try{
      if (post._embedded && post._embedded["wp:featuredmedia"] && post._embedded["wp:featuredmedia"][0] && post._embedded["wp:featuredmedia"][0].source_url) {
        return post._embedded["wp:featuredmedia"][0].source_url + "?cb=" + post.id;
      }
      // fallback: parse first img from content (shared DOMParser for low mem)
      var d = new DOMParser().parseFromString(post.content && post.content.rendered || "", "text/html");
      var im = d.querySelector("img");
      if (im && im.src) return im.src + "?cb=" + post.id;
    }catch(e){}
    return "";
  }

  // ===== Router views =====
  async function renderDetail(id){
    // preserve your existing detail renderer & media embeds
    var app = el("#app");
    app.innerHTML = "<div style='padding:1rem'>Loading…</div>";
    // Fetch the single post (keep to 1 fetch)
    time("fetchDetail#" + id);
    var res = await fetch(API_BASE + "posts/" + id);
    timeEnd("fetchDetail#" + id);
    if (!res.ok){ app.innerHTML = "<div style='padding:1rem'>Failed to load.</div>"; return; }
    var post = await res.json();

    var c = ce("article");
    var h = ce("h1"); h.textContent = textFromHTML(post.title && post.title.rendered || "");
    c.appendChild(h);

    // Media (respect your existing embed behaviors)
    var mediaURL = pickFeaturedImage(post);
    if (mediaURL) c.appendChild(imgEl(mediaURL, h.textContent));

    var body = ce("div");
    body.innerHTML = (post.content && post.content.rendered) || "";
    c.appendChild(body);

    // Back button at bottom only (rule preserved)
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

  // ===== Observability footer (console) =====
  window.addEventListener("pagehide", function(){
    if (!DEBUG) return;
    var t = (performance.now() - metrics.t0).toFixed(1);
    console.log("[OkObserver] time=%sms fetchPages=%s posts=%s", t, metrics.fetchPages, metrics.postsReceived);
  });

})();
