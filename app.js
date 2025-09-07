// app.js — OkObserver (v1.44.0 — AbortController, preconnect-ready, fast grid + cache)
const APP_VERSION = "v1.44.0";
window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT = "cartoon";
  const app = document.getElementById("app");

  // Manual scroll restoration to preserve position on return
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}

  // Home cache (persists across refresh via sessionStorage)
  window.__okCache = window.__okCache || {
    posts: [],
    page: 1,
    totalPages: 1,
    scrollY: 0,
    scrollAnchorPostId: null,
    searchKey: ""
  };
  function saveHomeCache(){ try{ sessionStorage.setItem("__okCache", JSON.stringify(window.__okCache)); }catch{} }
  (function loadHomeCache(){
    try {
      const raw = sessionStorage.getItem("__okCache");
      if (raw) {
        const val = JSON.parse(raw);
        if (val && typeof val === "object") window.__okCache = { ...window.__okCache, ...val };
      }
    } catch {}
  })();

  // Footer year + version
  window.addEventListener("DOMContentLoaded", () => {
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    const v = document.getElementById("appVersion");
    if (v) v.textContent = APP_VERSION;
  });

  // Error banner
  function showError(message) {
    const msg = (message && message.message) ? message.message : String(message || "Something went wrong.");
    const div = document.createElement("div");
    div.className = "error-banner";
    div.innerHTML = `<button class="close" aria-label="Dismiss error" title="Dismiss">×</button>${msg}`;
    app.prepend(div);
  }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".error-banner .close");
    if (btn) btn.closest(".error-banner")?.remove();
  });

  // Utils
  const esc = (s) => (s || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const getAuthor = (p) => p?._embedded?.author?.[0]?.name || "";
  const hasExcluded = (p) => (p?._embedded?.["wp:term"]?.[0] || [])
    .some(c => (c?.name || "").toLowerCase() === EXCLUDE_CAT);
  const getTags = (emb) => (emb?.flat() || []).filter(t => t?.taxonomy === "post_tag");

  function ordinalDate(iso) {
    const d = new Date(iso);
    const day = d.getDate();
    const suf = (n)=> (n>3 && n<21) ? "th" : (["th","st","nd","rd"][Math.min(n%10,4)] || "th");
    return `${d.toLocaleString("en-US",{month:"long"})} ${day}${suf(day)}, ${d.getFullYear()}`;
  }

  function firstImgFromHTML(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    const img = div.querySelector("img");
    if (!img) return "";
    const ss = img.getAttribute("srcset");
    if (ss) {
      const last = ss.split(",").map(s=>s.trim()).pop();
      const url = last?.split(" ")?.[0];
      if (url) return url;
    }
    return img.getAttribute("data-src") || img.getAttribute("src") || "";
  }

  function featuredImage(p) {
    const m = p?._embedded?.["wp:featuredmedia"]?.[0];
    if (!m) return "";
    const sizes = m.media_details?.sizes || {};
    return sizes?.["2048x2048"]?.source_url || sizes?.full?.source_url || sizes?.large?.source_url ||
           sizes?.medium_large?.source_url || sizes?.medium?.source_url || m.source_url || "";
  }

  function hardenLinks(root) {
    if (!root) return;
    root.querySelectorAll("a[href]").forEach(a => { a.target = "_blank"; a.rel = "noopener"; });
  }

  // Query helpers (#/?q=term)
  function parseQueryFromHash() {
    const h = location.hash || "#/";
    const qMatch = h.match(/[?&]q=([^&]+)/i);
    return qMatch ? decodeURIComponent(qMatch[1].replace(/\+/g, " ")) : "";
  }
  function setQueryInHash(q) {
    const base = "#/";
    const s = q ? `${base}?q=${encodeURIComponent(q.trim())}` : base;
    if (location.hash !== s) location.hash = s;
  }
  // De-lazy images (Smush/Jetpack placeholders)
  function deLazyImages(root) {
    if (!root) return;
    root.querySelectorAll("img").forEach((img) => {
      const realSrc = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original") || "";
      const realSrcset = img.getAttribute("data-srcset") || img.getAttribute("data-lazy-srcset") || "";
      if (realSrc) img.setAttribute("src", realSrc);
      if (realSrcset) img.setAttribute("srcset", realSrcset);
      img.classList.remove("lazyload","lazy","jetpack-lazy-image");
      img.loading = "lazy"; img.decoding = "async";
      img.style.maxWidth = img.style.maxWidth || "100%";
      img.style.height = img.style.height || "auto";
      img.addEventListener("load", () => { img.style.opacity = "1"; img.style.transition = "opacity .25s ease"; }, {once:true});
      if (!img.style.opacity) img.style.opacity = "0";
    });
  }

  // ===== Embeds normalize + scrubbers =====
  function normalizeContent(html) {
    const root = document.createElement("div");
    root.innerHTML = html || "";

    const findFbUrlInText = (s) => {
      if (!s) return null;
      const m = s.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s<>"']+/i) || s.match(/https?:\/\/fb\.watch\/[^\s<>"']+/i);
      return m ? m[0] : null;
    };
    const findVimeoUrlInText = (s) => {
      if (!s) return null;
      const m = s.match(/https?:\/\/(?:www\.|player\.)?vimeo\.com\/[^\s<>"']+/i);
      return m ? m[0] : null;
    };

    const buildFallback = (url, kind="generic") => {
      let thumb = "";
      if (kind === "vimeo") {
        const id = extractVimeoId(url || "");
        if (id) thumb = `<img src="${vimeoThumbUrl(id)}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:10px" onerror="this.remove()">`;
      }
      const box = document.createElement("div");
      box.className = "embed-fallback";
      box.innerHTML = `
        <div class="center" style="margin:12px 0;padding:16px;border:1px solid #ddd;border-radius:10px;background:#fafafa">
          ${thumb}
          <div style="margin-bottom:8px;">This ${kind==="vimeo"?"Vimeo":kind==="facebook"?"Facebook":"external"} video can’t be embedded here.</div>
          ${url ? `<a class="btn" href="${url}" target="_blank" rel="noopener">Open on ${kind==="vimeo"?"Vimeo":"Facebook"}</a>` : ""}
        </div>`;
      return box;
    };

    const containers = root.querySelectorAll([
      "figure.wp-block-embed","div.wp-block-embed",".wp-block-embed-facebook",".wp-block-embed-vimeo",".wp-block-embed__wrapper"
    ].join(","));

    containers.forEach((cont) => {
      let url = null; let kind = "generic";
      const iframe = cont.querySelector('iframe[src*="facebook.com"], iframe[src*="vimeo.com"]');
      if (iframe?.src) { url = iframe.src; kind = /vimeo\.com/i.test(url) ? "vimeo" : /facebook\.com/i.test(url) ? "facebook" : "generic"; }
      if (!url) {
        const a = cont.querySelector('a[href*="facebook.com"], a[href*="fb.watch"], a[href*="vimeo.com"]');
        if (a?.href) { url = a.href; kind = /vimeo\.com/i.test(url) ? "vimeo" : /facebook\.com|fb\.watch/i.test(url) ? "facebook" : "generic"; }
      }
      if (!url) {
        const rawVm = findVimeoUrlInText(cont.textContent?.trim() || "");
        const rawFb = findFbUrlInText(cont.textContent?.trim() || "");
        if (rawVm) { url = rawVm; kind = "vimeo"; }
        else if (rawFb) { url = rawFb; kind = "facebook"; }
      }
      if (url || !cont.querySelector("iframe, a, img, video")) cont.replaceWith(buildFallback(url, kind));
    });

    root.querySelectorAll(".wp-block-embed, .wp-block-embed__wrapper").forEach((el) => {
      if (!el.querySelector("iframe, a, img, video") && !el.textContent.trim()) el.remove();
    });

    deLazyImages(root);
    return root.innerHTML;
  }

  // Facebook helpers
  function extractFacebookVideoId(url) {
    try {
      const u = new URL(url);
      if ((u.hostname.endsWith("facebook.com") || u.hostname.endsWith("fb.watch")) && u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/\/videos\/(\d+)(?:\/|$)/); if (m && m[1]) return m[1];
    } catch {}
    return null;
  }
  function findFacebookVideoIdInHtml(html) {
    const div = document.createElement("div"); div.innerHTML = html || "";
    const a = div.querySelector('a[href*="facebook.com/watch"], a[href*="facebook.com/"], a[href*="/videos/"]');
    if (a?.href) { const id = extractFacebookVideoId(a.href); if (id) return id; }
    const iframe = div.querySelector('iframe[src*="facebook.com"]');
    if (iframe?.src) { const id = extractFacebookVideoId(iframe.src); if (id) return id; }
    const text = div.textContent || "";
    const m = text.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s<>"']+/i) || text.match(/https?:\/\/fb\.watch\/[^\s<>"']+/i);
    if (m) { const id = extractFacebookVideoId(m[0]); if (id) return id; }
    return null;
  }
  function fbVideoThumbUrl(videoId){ return `https://graph.facebook.com/${videoId}/picture?type=large`; }

  // Vimeo helpers
  function extractVimeoId(url) {
    try {
      const u = new URL(url); const host = u.hostname.replace(/^www\./,'');
      if (!/vimeo\.com$/i.test(host) && !/player\.vimeo\.com$/i.test(host) && !host.includes("vimeo.com")) return null;
      let m = u.pathname.match(/\/video\/(\d+)(?:\/|$)/); if (m && m[1]) return m[1];
      m = u.pathname.match(/\/(\d+)(?:\/|$)/); if (m && m[1]) return m[1];
    } catch {}
    return null;
  }
  function findVimeoIdInHtml(html) {
    const div = document.createElement("div"); div.innerHTML = html || "";
    const a = div.querySelector('a[href*="vimeo.com"]'); if (a?.href) { const id = extractVimeoId(a.href); if (id) return id; }
    const iframe = div.querySelector('iframe[src*="vimeo.com"]'); if (iframe?.src) { const id = extractVimeoId(iframe.src); if (id) return id; }
    const text = div.textContent || ""; const m = text.match(/https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)/i);
    if (m && m[1]) return m[1];
    return null;
  }
  function vimeoPlayerUrl(id){ return `https://player.vimeo.com/video/${id}`; }
  function vimeoThumbUrl(id){ return `https://vumbnail.com/${id}.jpg`; }

  // Scrub blank clickable FB/Vimeo blocks
  function scrubBlankFacebookBlocks(scope) {
    const host = scope || document;
    host.querySelectorAll("p, div, figure").forEach((el) => {
      if (el.querySelector("img, iframe, video, .embed-fallback, .btn")) return;
      const anchors = Array.from(el.querySelectorAll('a[href]')).filter(a => /facebook\.com|fb\.watch/i.test(a.getAttribute('href') || ''));
      if (anchors.length !== 1) return;
      const clone = el.cloneNode(true); const a = clone.querySelector('a[href*="facebook.com"], a[href*="fb.watch"]'); if (a) a.remove();
      if ((clone.textContent || '').trim() !== '') return;
      const href = anchors[0].getAttribute('href') || '#';
      const box = document.createElement("div");
      box.className = "embed-fallback";
      box.innerHTML = `<div class="center" style="margin:12px 0;padding:16px;border:1px solid #ddd;border-radius:10px;background:#fafafa">
        <div style="margin-bottom:8px;">This Facebook video can’t be embedded here.</div>
        <a class="btn" href="${href}" target="_blank" rel="noopener">Open on Facebook</a>
      </div>`;
      el.replaceWith(box);
    });
  }
  function scrubBlankVimeoBlocks(scope) {
    const host = scope || document;
    host.querySelectorAll("p, div, figure").forEach((el) => {
      if (el.querySelector("img, iframe, video, .embed-fallback, .btn")) return;
      const anchors = Array.from(el.querySelectorAll('a[href]')).filter(a => /vimeo\.com/i.test(a.getAttribute('href') || ''));
      if (anchors.length !== 1) return;
      const clone = el.cloneNode(true); const a = clone.querySelector('a[href*="vimeo.com"]'); if (a) a.remove();
      if ((clone.textContent || '').trim() !== '') return;
      const href = anchors[0].getAttribute('href') || '#';
      let thumb = ""; try { const id = extractVimeoId(href); if (id) thumb = `<img src="${vimeoThumbUrl(id)}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:10px" onerror="this.remove()">`; } catch {}
      const box = document.createElement("div");
      box.className = "embed-fallback";
      box.innerHTML = `<div class="center" style="margin:12px 0;padding:16px;border:1px solid #ddd;border-radius:10px;background:#fafafa">
        ${thumb}
        <div style="margin-bottom:8px;">This Vimeo video can’t be embedded here.</div>
        <a class="btn" href="${href}" target="_blank" rel="noopener">Open on Vimeo</a>
      </div>`;
      el.replaceWith(box);
    });
  }
  // Track scroll + anchor BEFORE navigating into a post
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#/post/"]');
    if (!link) return;
    try {
      window.__okCache.scrollY = window.scrollY || 0;
      const card = link.closest(".card");
      const idFromHref = (link.getAttribute("href") || "").split("/")[2];
      window.__okCache.scrollAnchorPostId = (card && card.dataset.postId) || idFromHref || null;
      saveHomeCache();
    } catch {}
  });

  // Treat "Back to posts" like real history back
  document.addEventListener("click", (e) => {
    const back = e.target.closest('a[href="#/"]');
    if (!back) return;
    e.preventDefault();
    const before = location.hash;
    history.back();
    setTimeout(() => { if (location.hash === before) location.hash = "#/"; }, 150);
  });

  // Offline/online banner
  function ensureNetBannerRoot(){
    let el = document.getElementById("net-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "net-banner";
      el.style.cssText = "display:none;position:sticky;top:0;z-index:20;padding:8px 12px;background:#fffae6;border-bottom:1px solid #f0d000;text-align:center;font-size:.9em";
      document.body.prepend(el);
    }
    return el;
  }
  function setNetBanner(text){
    const el = ensureNetBannerRoot();
    if (!text) { el.style.display="none"; el.textContent=""; return; }
    el.textContent = text; el.style.display="block";
  }
  window.addEventListener("online",  () => setNetBanner("You’re back online."), {passive:true});
  window.addEventListener("offline", () => setNetBanner("You’re offline. Some actions may not work."), {passive:true});
  if (!navigator.onLine) setNetBanner("You’re offline. Some actions may not work.");

  // ===== AbortController wiring (separate controllers for list vs detail) =====
  let listController = null;
  let detailController = null;

  function abortList() { try { listController?.abort(); } catch {} finally { listController = null; } }
  function abortDetail() { try { detailController?.abort(); } catch {} finally { detailController = null; } }

  async function fetchPosts({ page=1, search="" } = {}) {
    abortList(); // cancel any in-flight list fetch
    listController = new AbortController();

    const fields = "id,date,title,excerpt,_embedded.wp:featuredmedia,_embedded.author";
    const url = `${BASE}/posts?_embed=1&_fields=${encodeURIComponent(fields)}&per_page=${PER_PAGE}&page=${page}${
      search ? `&search=${encodeURIComponent(search)}` : "" }`;

    const res = await fetch(url, { signal: listController.signal, credentials:"omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const totalPages = Number(res.headers.get("X-WP-TotalPages") || "1");
    const items = await res.json();
    return { posts: items.filter(p => !hasExcluded(p)), totalPages };
  }

  async function fetchPost(id) {
    abortDetail(); // cancel any in-flight detail fetch
    detailController = new AbortController();

    const url = `${BASE}/posts/${id}?_embed=1`;
    const res = await fetch(url, { signal: detailController.signal, credentials:"omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Build a card element (fast; no full content parsing)
  function buildCardElement(p) {
    let media = featuredImage(p) || firstImgFromHTML(p.excerpt?.rendered) || "";
    const author = esc(getAuthor(p));
    const date = ordinalDate(p.date);

    const el = document.createElement("div");
    el.className = "card";
    el.dataset.postId = p.id;
    el.innerHTML = `
      ${ media
          ? `<a href="#/post/${p.id}"><img class="thumb" src="${media}" alt="" sizes="(max-width:600px) 100vw, 33vw"></a>`
          : `<a href="#/post/${p.id}"><div class="thumb"></div></a>` }
      <div class="card-body">
        <h2 class="title"><a href="#/post/${p.id}" style="color:inherit;text-decoration:none;">${p.title.rendered}</a></h2>
        <div class="meta-author-date">
          ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
          <span class="date">${date}</span>
        </div>
        <div class="excerpt">${p.excerpt.rendered}</div>
        <a class="btn" href="#/post/${p.id}">Read more</a>
      </div>`;
    const t = el.querySelector("img.thumb");
    if (t) t.addEventListener("error", () => { const a = t.closest("a"); if (a) a.innerHTML = `<div class="thumb"></div>`; }, { once:true });
    hardenLinks(el.querySelector(".excerpt"));
    return el;
  }

  // Skeleton helpers
  function skeletonCardHTML(){
    return `<div class="card skeleton">
      <div class="thumb skeleton-thumb"></div>
      <div class="card-body">
        <div class="skeleton-line" style="width:70%;height:16px;margin:6px 0;"></div>
        <div class="skeleton-line" style="width:45%;height:12px;margin:6px 0;"></div>
        <div class="skeleton-line" style="width:90%;height:12px;margin:10px 0;"></div>
        <div class="skeleton-line" style="width:80%;height:12px;margin:6px 0;"></div>
        <div class="skeleton-pill" style="width:110px;height:30px;margin-top:8px;"></div>
      </div></div>`;
  }
  function showSkeletons(container, count=6){
    const frag = document.createDocumentFragment();
    for (let i=0;i<count;i++){ const d=document.createElement("div"); d.innerHTML=skeletonCardHTML(); frag.appendChild(d.firstElementChild); }
    container.appendChild(frag);
  }
  function clearSkeletons(container){ container.querySelectorAll(".skeleton").forEach(n=>n.remove()); }
  // Restore scroll (anchor first, then Y; retry while images settle)
  function restoreHomeScroll() {
    const cache = window.__okCache || {};
    const targetId = cache.scrollAnchorPostId;
    const targetY = cache.scrollY || 0;
    let attempts = 0, max = 20;
    function tick(){
      let used=false;
      if (targetId) {
        const card = document.querySelector(`.card[data-post-id="${CSS.escape(String(targetId))}"]`);
        if (card) {
          const y = Math.max(0, card.getBoundingClientRect().top + window.scrollY - 8);
          window.scrollTo(0,y); used=true;
        }
      }
      if (!used) window.scrollTo(0,targetY);
      if (++attempts < max) setTimeout(tick, 50);
    }
    requestAnimationFrame(tick);
  }

  // Home (infinite scroll + button) with cache + search
  function renderHome({ search = "" } = {}) {
    try { window.__okInfObs?.disconnect(); } catch {}
    window.__okInfObs = null;

    // Abort any detail fetch as we’re leaving detail
    abortDetail();

    const qFromHash = parseQueryFromHash();
    const effectiveSearch = (search || qFromHash || "").trim();
    const key = effectiveSearch.toLowerCase();

    if (window.__okCache.searchKey !== key) {
      window.__okCache = { posts: [], page: 1, totalPages: 1, scrollY: 0, scrollAnchorPostId: null, searchKey: key };
      saveHomeCache();
    }

    app.innerHTML = `
      <h1 style="margin-bottom:10px;">Latest Posts</h1>
      <div style="margin:8px 0 16px 0;">
        <input id="searchBox" type="search" placeholder="Search posts…" value="${esc(effectiveSearch)}"
          style="width:100%;max-width:420px;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:1em" />
      </div>
      <div id="grid" class="grid"></div>
      <div class="center" style="margin:12px 0;"><button id="loadMore" class="btn">Load more</button></div>
      <div id="sentinel" style="height:1px;"></div>
    `;

    const grid = document.getElementById("grid");
    const loadMore = document.getElementById("loadMore");
    const sentinel = document.getElementById("sentinel");
    const searchBox = document.getElementById("searchBox");

    let page = window.__okCache.page || 1;
    let totalPages = window.__okCache.totalPages || 1;
    let loading = false;
    const seen = new Set();

    // Debounced search → update hash
    let tId=null;
    searchBox.addEventListener("input", () => {
      const val = searchBox.value.trim();
      if (tId) clearTimeout(tId);
      tId = setTimeout(() => setQueryInHash(val), 250);
    });

    // Skeletons if cold
    if (!window.__okCache.posts.length) showSkeletons(grid, 6);

    // Replay cache
    if (window.__okCache.posts.length) {
      const frag = document.createDocumentFragment();
      window.__okCache.posts.forEach(p => {
        if (!hasExcluded(p) && !seen.has(p.id)) { seen.add(p.id); frag.appendChild(buildCardElement(p)); }
      });
      grid.appendChild(frag);
      clearSkeletons(grid);
      restoreHomeScroll();
      if (page > totalPages) { loadMore.textContent = "No more posts."; loadMore.disabled = true; }
    }

    async function load() {
      if (loading) return;
      loading = true;
      if (loadMore) { loadMore.disabled = true; loadMore.textContent = "Loading…"; }
      showSkeletons(grid, 3);

      try {
        const { posts, totalPages: tp } = await fetchPosts({ page, search: effectiveSearch });
        totalPages = tp || 1;

        const frag = document.createDocumentFragment();
        for (const p of posts) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          frag.appendChild(buildCardElement(p));
          window.__okCache.posts.push(p);
        }
        grid.appendChild(frag);

        page++; window.__okCache.page = page; window.__okCache.totalPages = totalPages; saveHomeCache();

        const done = page > totalPages;
        if (done) {
          if (loadMore) { loadMore.textContent = "No more posts."; loadMore.disabled = true; }
          if (window.__okInfObs) window.__okInfObs.disconnect();
        } else {
          if (loadMore) { loadMore.textContent = "Load more"; loadMore.disabled = false; }
          if ("requestIdleCallback" in window) {
            requestIdleCallback(() => { fetchPosts({ page, search: effectiveSearch }).catch(()=>{}); }, { timeout: 1000 });
          }
        }
      } catch (e) {
        if (e.name === "AbortError") {
          // stale list fetch — ignore quietly
        } else {
          showError(`Failed to load posts: ${e.message || e}`);
          if (loadMore) { loadMore.textContent = "Retry"; loadMore.disabled = false; }
        }
      } finally {
        clearSkeletons(grid);
        loading = false;
      }
    }

    loadMore?.addEventListener("click", load);

    if ("IntersectionObserver" in window && sentinel) {
      const obs = new IntersectionObserver((entries) => {
        for (const entry of entries) if (entry.isIntersecting) {
          if (page <= totalPages && !loading) load();
        }
      }, { rootMargin: "600px 0px 600px 0px" });
      obs.observe(sentinel);
      window.__okInfObs = obs;
      if (!window.__okCache.posts.length) load();
    } else {
      if (!window.__okCache.posts.length) load();
    }
  }

  // Post detail
  async function renderPost(id) {
    // Abort any list fetch as we leave home
    abortList();

    try { window.__okCache.scrollY = window.scrollY || 0; saveHomeCache(); } catch {}
    app.innerHTML = `<p class="center">Loading post…</p>`;
    try {
      const p = await fetchPost(id);
      if (!p) return;
      if (hasExcluded(p)) { app.innerHTML = `<div class="error-banner"><button class="close">×</button>This post is not available.</div>`; return; }

      const author = esc(getAuthor(p));
      const date = ordinalDate(p.date);
      const tags = getTags(p._embedded?.["wp:term"]) || [];

      const rawHtml = p.content?.rendered || "";
      const normalizedHtml = normalizeContent(rawHtml);

      let hero = featuredImage(p) || firstImgFromHTML(normalizedHtml) || "";
      if (!hero) { const fbId = findFacebookVideoIdInHtml(normalizedHtml); if (fbId) hero = fbVideoThumbUrl(fbId); }
      if (!hero) { const vmId = findVimeoIdInHtml(normalizedHtml); if (vmId) hero = vimeoThumbUrl(vmId); }

      app.innerHTML = `
        <article class="post">
          <p><a href="#/" class="btn" style="margin-bottom:12px">← Back to posts</a></p>
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">
            ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
            <span class="date">${date}</span>
          </div>
          ${hero ? `<img class="hero" src="${hero}" alt="" loading="lazy">` : ""}
          <div class="content">${normalizedHtml}</div>
          ${ tags.length ? `<div class="tags"><span style="margin-right:6px;">Tags:</span>${tags.map(t=>`<a class="tag-chip" href="https://okobserver.org/tag/${t.slug}/" target="_blank" rel="noopener">${esc(t.name)}</a>`).join("")}</div>` : "" }
          <p><a href="#/" class="btn" style="margin-top:16px">← Back to posts</a></p>
        </article>`;

      hardenLinks(document.querySelector(".post"));
      const scope = document.querySelector(".post");
      scrubBlankFacebookBlocks(scope);
      scrubBlankVimeoBlocks(scope);

      const heroImg = document.querySelector(".post img.hero");
      if (heroImg) heroImg.addEventListener("error", () => heroImg.remove(), { once: true });

    } catch (e) {
      if (e.name === "AbortError") {
        // stale detail fetch — do nothing
      } else {
        app.innerHTML = `<div class="error-banner"><button class="close">×</button>Error loading post: ${e.message || e}</div>`;
      }
    }
  }

  // Self-check
  function selfCheck(){
    const missing=[];
    if (typeof renderHome!=="function") missing.push("renderHome");
    if (typeof renderPost!=="function") missing.push("renderPost");
    if (typeof fetchPosts!=="function") missing.push("fetchPosts");
    if (typeof fetchPost!=="function") missing.push("fetchPost");
    if (missing.length){ showError(`App init error: missing functions → ${missing.join(", ")}`); throw new Error("App self-check failed"); }
  }

  // Router
  function router(){
    try{
      const hash = location.hash || "#/";
      if (hash.startsWith("#/?") || hash === "#/" || hash === ""){
        renderHome({ search: parseQueryFromHash() }); return;
      }
      if (hash.startsWith("#/post/")){
        const id = hash.split("/")[2]?.split("?")[0];
        renderPost(id); return;
      }
      if (hash === "#/about"){
        app.innerHTML = `<article class="post">
          <h1>About</h1>
          <p><strong>OkObserver</strong> is an unofficial reader for okobserver.org.</p>
        </article>`; return;
      }
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Page not found</div>`;
    }catch(e){ showError(`Router crash: ${e?.message || e}`); }
  }

  // Wire up
  window.addEventListener("hashchange", router);
  window.addEventListener("load", () => { try { selfCheck(); router(); } catch {} });
  window.addEventListener("error", (e) => showError(`Runtime error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => showError(`Unhandled promise rejection: ${e.reason?.message || e.reason}`));
})();
