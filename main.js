/* 🟢 main.js */
/* OkObserver main.js — v=2025-11-07SR1-perfSWR1-videoR1
   Restores & improves video enhancements:
   - Click-to-play wrappers for YouTube, Vimeo, Facebook, MP4
   - No autoplay on load; real player is only mounted on user click
   - Lazy thumbnails (YouTube uses hqdefault); Vimeo/FB/MP4 fall back to featured image
   - Keeps 1 fetch per page, return-to-scroll, cartoon filter, blue titles, detail image no-crop
*/
(function(){
  "use strict";

  var VER   = (window.__OKO__ && window.__OKO__.VER) || "2025-11-07SR1-perfSWR1-videoR1";
  var DEBUG = !!(window.__OKO__ && window.__OKO__.DEBUG);

  var API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/";
  var PAGE_SIZE = 12;

  function el(s){ return document.querySelector(s); }
  function ce(t,c){ var n=document.createElement(t); if(c) n.className=c; return n; }
  function textFromHTML(html){ var d=new DOMParser().parseFromString(html||"","text/html"); return d.body.textContent||""; }

  // ---- Session cache for list + scroll position
  var SS_LIST   = "oko:list:v1";
  var SS_SCROLL = "oko:scrollTop:v1";
  var SS_PAGE   = "oko:page:v1";

  // ---- Cartoon filter
  function isCartoon(post){
    try{
      var terms = post._embedded && post._embedded["wp:term"] && post._embedded["wp:term"][0] || [];
      if (terms.some(function(t){ var n=(t&&t.name||"").toLowerCase(); return n.includes("cartoon") || n==="cartoons"; })) return true;
      var cats = post.categories || [];
      return cats.some(function(c){ var s=String(c).toLowerCase(); return s.includes("cartoon") || s==="1109" || s==="cartoons"; });
    }catch(_){}
    return false;
  }

  // ---- Grid enforcer
  var gridObserver;
  function mountGridObserver(grid){
    try{ if (gridObserver) gridObserver.disconnect(); }catch(_){}
    gridObserver = new MutationObserver(function(){ grid.style.display = "grid"; });
    gridObserver.observe(grid, {childList:true});
  }

  // ---- Fetch posts (1 fetch per page)
  var state = { page: 1, loading: false, done: false, list: [] };

  async function fetchPage(page){
    if (state.loading || state.done) return [];
    state.loading = true;
    var url = API_BASE + "posts?per_page=" + PAGE_SIZE + "&page=" + page + "&_embed=1&orderby=date&order=desc";
    var res = await fetch(url, { credentials: "omit" });
    if (!res.ok) {
      state.loading = false;
      if (res.status === 400 || res.status === 404) { state.done = true; return []; }
      throw new Error("Network error " + res.status);
    }
    var posts = await res.json();
    if (!posts.length) state.done = true;
    state.loading = false;
    return posts;
  }

  // ---- Utilities
  function bylineFrom(post){
    return (post._embedded && post._embedded.author && post._embedded.author[0] && post._embedded.author[0].name) || "The Oklahoma Observer";
  }
  function dateFrom(post){
    try{ var d=new Date(post.date); return d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch(_){return"";}
  }

  function withCB(url, id){
    try{ var u=new URL(url, location.origin); u.searchParams.set("cb", String(id)); return u.toString(); }
    catch(_){ return url + (url.includes("?")?"&":"?") + "cb=" + id; }
  }

  // Pick featured image for both summary and detail
  function pickFeaturedImage(post){
    try{
      var fm = post._embedded && post._embedded["wp:featuredmedia"] && post._embedded["wp:featuredmedia"][0];
      if (fm) {
        var md = fm.media_details && fm.media_details.sizes;
        var order = ["large","medium_large","full","medium","thumbnail"];
        if (md) for (var i=0;i<order.length;i++){ var k=order[i]; if(md[k]&&md[k].source_url) return withCB(md[k].source_url, post.id); }
        if (fm.source_url) return withCB(fm.source_url, post.id);
      }
      var d = new DOMParser().parseFromString(post.content && post.content.rendered || "", "text/html");
      var im = d.querySelector("img");
      if (im && im.src) return withCB(im.src, post.id);
    }catch(_){}
    return "";
  }

  // ---- HOME (summary grid)
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
        list.forEach(function(p){ if(!isCartoon(p)) grid.appendChild(cardFromPost(p)); });
        var y = parseFloat(sessionStorage.getItem(SS_SCROLL) || "0"); if (!isNaN(y)) window.scrollTo(0, y);
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
    var next = (state.page||0) + (state.list.length?1:0) || 1;
    var posts = await fetchPage(next);
    posts = posts.filter(function(p){ return !isCartoon(p); });
    posts.forEach(function(p){ state.list.push(p); grid.insertBefore(cardFromPost(p), grid.lastElementChild); });
    if (posts.length) {
      state.page = next;
      try{ sessionStorage.setItem(SS_LIST, JSON.stringify(state.list)); sessionStorage.setItem(SS_PAGE, String(state.page)); }catch(_){}
    }
  }

  function cardFromPost(post){
    var card = ce("article","oo-card");
    var a = ce("a","oo-titlelink"); a.href = "#/post/" + post.id;

    var mediaSrc = pickFeaturedImage(post);
    if (mediaSrc) {
      var img = new Image(); img.className="oo-media"; img.loading="lazy"; img.decoding="async"; img.src=mediaSrc; img.alt=textFromHTML(post.title && post.title.rendered || "");
      a.appendChild(img);
    }

    var body = ce("div","oo-card-body"); a.appendChild(body);
    var title = ce("h2","oo-titletext"); title.innerHTML = (post.title && post.title.rendered) || "Untitled"; title.style.color = "#1E90FF";
    var meta = ce("div","oo-meta");
    var by = ce("span","oo-byline"); by.textContent = bylineFrom(post);
    var dt = ce("span","oo-date"); dt.textContent = dateFrom(post);
    meta.appendChild(by); meta.appendChild(dt);

    var excerpt = ce("p","oo-excerpt"); excerpt.innerHTML = (post.excerpt && post.excerpt.rendered) || "";

    body.appendChild(title); body.appendChild(meta); body.appendChild(excerpt);
    card.appendChild(a);
    return card;
  }

  // ---- VIDEO ENHANCEMENTS
  function getYouTubeId(url){
    try{
      var u = new URL(url);
      if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
      if (u.hostname.includes("youtube.com")) return u.searchParams.get("v") || (u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : "");
    }catch(_){} return "";
  }
  function createVideoShell(poster, label){
    var wrap = ce("div","oo-video");
    var img  = new Image(); img.className = "oo-video-poster"; img.decoding="async"; img.loading="lazy"; img.alt = label || "Play";
    if (poster) img.src = poster;
    var btn  = ce("button","oo-video-play"); btn.type="button"; btn.setAttribute("aria-label","Play video");
    btn.textContent = "►";
    wrap.appendChild(img); wrap.appendChild(btn);
    return {wrap:wrap, poster:img, btn:btn};
  }
  function mountYouTube(container, id){
    var iframe = ce("iframe","oo-video-iframe");
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";
    iframe.src = "https://www.youtube.com/embed/" + encodeURIComponent(id) + "?autoplay=1&rel=0&modestbranding=1";
    container.replaceWith(iframe);
  }
  function mountVimeo(container, vimeoUrl){
    // Expect full player URL or video id; keep simple and reliable
    var src = vimeoUrl;
    try {
      var u = new URL(vimeoUrl); 
      if (!/player\.vimeo\.com\/video\//.test(u.href)) {
        // fallback: leave as-is
      }
    } catch(_){}
    var iframe = ce("iframe","oo-video-iframe");
    iframe.allow = "autoplay; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true; iframe.loading="lazy";
    iframe.src = src.includes("?") ? src + "&autoplay=1" : src + "?autoplay=1";
    container.replaceWith(iframe);
  }
  function mountFacebook(container, fbSrc){
    var iframe = ce("iframe","oo-video-iframe");
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true; iframe.loading="lazy";
    iframe.src = fbSrc.includes("?") ? fbSrc + "&autoplay=1" : fbSrc + "?autoplay=1";
    container.replaceWith(iframe);
  }
  function mountMP4(container, mp4Url, poster){
    var v = ce("video","oo-video-elem");
    v.controls = true; v.autoplay = true; v.playsInline = true; v.preload = "metadata";
    if (poster) v.poster = poster;
    var src = document.createElement("source"); src.src = mp4Url; src.type = "video/mp4";
    v.appendChild(src);
    container.replaceWith(v);
  }

  function enhanceEmbeds(rootEl, post){
    var doc = new DOMParser().parseFromString(rootEl.innerHTML, "text/html");
    var changed = false;

    // Handle iframes and links
    var iframes = Array.from(doc.querySelectorAll("iframe"));
    var links   = Array.from(doc.querySelectorAll("a[href]"));

    var featuredPoster = pickFeaturedImage(post);

    // Iframes
    iframes.forEach(function(f){
      var src = f.src || "";
      var label = textFromHTML(post.title && post.title.rendered || "Video");
      // YouTube
      if (/youtube\.com\/embed\/|youtube\.com\/watch|youtu\.be\//i.test(src)) {
        var id = getYouTubeId(src) || getYouTubeId(f.getAttribute("data-src") || "");
        if (id) {
          var shell = createVideoShell("https://img.youtube.com/vi/" + id + "/hqdefault.jpg", label);
          // on click -> mount iframe
          shell.btn.addEventListener("click", function(){ mountYouTube(shell.wrap, id); });
          f.replaceWith(shell.wrap); changed = true;
          return;
        }
      }
      // Vimeo
      if (/player\.vimeo\.com\/video\//i.test(src)) {
        var shellV = createVideoShell(featuredPoster, label);
        shellV.btn.addEventListener("click", function(){ mountVimeo(shellV.wrap, src); });
        f.replaceWith(shellV.wrap); changed = true; return;
      }
      // Facebook
      if (/facebook\.com\/plugins\/video\.php/i.test(src)) {
        var shellF = createVideoShell(featuredPoster, label);
        shellF.btn.addEventListener("click", function(){ mountFacebook(shellF.wrap, src); });
        f.replaceWith(shellF.wrap); changed = true; return;
      }
    });

    // Direct MP4 links -> click to play
    links.forEach(function(a){
      var href = a.getAttribute("href") || "";
      if (/\.mp4(\?|$)/i.test(href)) {
        var label = textFromHTML(post.title && post.title.rendered || "Video");
        var shellM = createVideoShell(featuredPoster, label);
        shellM.btn.addEventListener("click", function(){ mountMP4(shellM.wrap, href, featuredPoster); });
        a.replaceWith(shellM.wrap); changed = true;
      }
    });

    if (changed) {
      // write back into root element
      rootEl.innerHTML = doc.body.innerHTML;
    }
  }

  // ---- DETAIL
  async function renderDetail(id){
    var app = el("#app");
    app.innerHTML = "<div style='padding:1rem'>Loading…</div>";
    var res = await fetch(API_BASE + "posts/" + id + "?_embed=1");
    if (!res.ok){ app.innerHTML = "<div style='padding:1rem'>Failed to load.</div>"; return; }
    var post = await res.json();

    var article = ce("article");

    // Featured image: insert only after it fully loads (prevents favicon flash)
    var mediaURL = pickFeaturedImage(post);
    if (mediaURL){
      var img = new Image();
      img.className = "oo-media";
      img.decoding = "async";
      img.loading = "eager";
      img.alt = textFromHTML(post.title && post.title.rendered || "");
      img.addEventListener("load", function(){ article.insertBefore(img, article.firstChild || null); }, { once:true });
      img.src = mediaURL;
    }

    // Title (OkObserver blue)
    var h = ce("h1"); h.textContent = textFromHTML(post.title && post.title.rendered || ""); h.style.color = "#1E90FF"; article.appendChild(h);

    // Byline + date
    var meta = ce("p"); meta.style.margin="0 0 1rem"; meta.style.color="#445"; meta.style.fontWeight="500";
    meta.textContent = bylineFrom(post) + " — " + dateFrom(post);
    article.appendChild(meta);

    // Content
    var body = ce("div","post-content");
    body.innerHTML = (post.content && post.content.rendered) || "";
    article.appendChild(body);

    // Enhance embeds in-place
    enhanceEmbeds(body, post);

    // Back to posts
    var backWrap = ce("p");
    var btn = ce("button","oo-backbtn"); btn.type="button"; btn.textContent = "← Back to Posts";
    btn.addEventListener("click", function(){ location.hash = "#/"; });
    backWrap.appendChild(btn); article.appendChild(backWrap);

    app.innerHTML = ""; app.appendChild(article);
  }

  // ---- Simple About
  function renderAbout(){
    var app = el("#app");
    app.innerHTML = "<section class='oo-app'><h1>About The Oklahoma Observer</h1><p>Independent journalism for Oklahoma since 1969.</p></section>";
  }

  // ---- Router
  window.addEventListener("hashchange", router);
  document.addEventListener("DOMContentLoaded", router);

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
})();
 /* 🔴 main.js */
