// app.js — OkObserver (v1.45.3 — fix Back link opening new tab; stable back + perf)
const APP_VERSION = "v1.45.3";
window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

(() => {
  const BASE = "https://okobserver.org/wp-json/wp/v2";
  const PER_PAGE = 12;
  const EXCLUDE_CAT = "cartoon"; // category slug/name, case-insensitive
  const app = document.getElementById("app");

  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}

  // Home cache (kept simple & reliable)
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

  // Footer year + version (if those spans exist)
  window.addEventListener("DOMContentLoaded", () => {
    const y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear();
    const v = document.getElementById("appVersion"); if (v) v.textContent = APP_VERSION;
  });

  // Error banner
  function showError(message) {
    const msg = (message && message.message) ? message.message : String(message || "Something went wrong.");
    const div = document.createElement("div");
    div.className = "error-banner";
    div.innerHTML = `<button class="close" aria-label="Dismiss">×</button>${msg}`;
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

  // ✅ Only check real categories; match by slug or name, case-insensitive
  function hasExcluded(p) {
    const groups = p?._embedded?.["wp:term"] || [];
    const cats = groups.flat().filter(t => (t?.taxonomy || "").toLowerCase() === "category");
    const norm = (x) => (x || "").trim().toLowerCase();
    return cats.some(c => norm(c.slug) === EXCLUDE_CAT || norm(c.name) === EXCLUDE_CAT);
  }

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

  // Featured image (choose best available size; fallback to source_url)
  function featuredImage(p) {
    const m = p?._embedded?.["wp:featuredmedia"]?.[0];
    if (!m) return "";
    const sizes = m.media_details?.sizes || {};
    return (
      sizes?.["2048x2048"]?.source_url ||
      sizes?.["1536x1536"]?.source_url ||
      sizes?.large?.source_url ||
      sizes?.medium_large?.source_url ||
      sizes?.medium?.source_url ||
      m.source_url ||
      ""
    );
  }

  // 🔧 FIX: only external links open in new tab; internal `#/…` stay in the SPA
  function hardenLinks(root) {
    if (!root) return;
    root.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href") || "";
      const isInternal = href.startsWith("#/");
      if (isInternal) {
        a.removeAttribute("target");
        a.removeAttribute("rel");
        return;
      }
      if (/^https?:\/\//i.test(href)) {
        a.target = "_blank";
        a.rel = "noopener";
      }
    });
  }

  // Query helpers
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
  // ===== Content normalization & video helpers =====
  function deLazyImages(root) {
    if (!root) return;
    root.querySelectorAll("img").forEach((img) => {
      const realSrc = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original") || "";
      const realSrcset = img.getAttribute("data-srcset") || img.getAttribute("data-lazy-srcset") || "";
      if (realSrc) img.setAttribute("src", realSrc);
      if (realSrcset) img.setAttribute("srcset", realSrcset);
      img.classList.remove("lazyload","lazy","jetpack-lazy-image");
      img.loading = "lazy"; img.decoding = "async";
      if (!img.style.maxWidth) img.style.maxWidth = "100%";
      if (!img.style.height) img.style.height = "auto";
    });
  }

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

  // Video helpers + primary video URL detection for hero link
  function extractFacebookVideoId(url) {
    try {
      const u = new URL(url);
      if ((u.hostname.endsWith("facebook.com") || u.hostname.endsWith("fb.watch")) && u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/\/videos\/(\d+)(?:\/|$)/); if (m && m[1]) return m[1];
    } catch {}
    return null;
  }
  function fbVideoThumbUrl(videoId){ return `https://graph.facebook.com/${videoId}/picture?type=large`; }

  function extractVimeoId(url) {
    try {
      const u = new URL(url); const host = u.hostname.replace(/^www\./,'');
      if (!/vimeo\.com$/i.test(host) && !/player\.vimeo\.com$/i.test(host) && !host.includes("vimeo.com")) return null;
      let m = u.pathname.match(/\/video\/(\d+)(?:\/|$)/); if (m && m[1]) return m[1];
      m = u.pathname.match(/\/(\d+)(?:\/|$)/); if (m && m[1]) return m[1];
    } catch {}
    return null;
  }
  function vimeoThumbUrl(id){ return `https://vumbnail.com/${id}.jpg`; }

  // Find FIRST facebook/vimeo URL in HTML (for making hero clickable)
  function findPrimaryVideoUrl(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    const aFb = div.querySelector('a[href*="facebook.com"], a[href*="fb.watch"]');
    const aVm = div.querySelector('a[href*="vimeo.com"]');
    const iFb = div.querySelector('iframe[src*="facebook.com"]');
    const iVm = div.querySelector('iframe[src*="vimeo.com"]');
    if (aFb?.href) return { kind: "facebook", url: aFb.href };
    if (aVm?.href) return { kind: "vimeo", url: aVm.href };
    if (iFb?.src) return { kind: "facebook", url: iFb.src };
    if (iVm?.src) return { kind: "vimeo", url: iVm.src };
    const text = div.textContent || "";
    const mFb = text.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s<>"']+/i) || text.match(/https?:\/\/fb\.watch\/[^\s<>"']+/i);
    if (mFb) return { kind: "facebook", url: mFb[0] };
    const mVm = text.match(/https?:\/\/(?:www\.|player\.)?vimeo\.com\/[^\s<>"']+/i);
    if (mVm) return { kind: "vimeo", url: mVm[0] };
    return null;
  }
  // ===== API (full embed for reliability) =====
  async function fetchPosts({ page = 1, search = "" } = {}) {
    const url = `${BASE}/posts?_embed=1&per_page=${PER_PAGE}&page=${page}${
      search ? `&search=${encodeURIComponent(search)}` : ""
    }`;
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const totalPages = Number(res.headers.get("X-WP-TotalPages") || "1");
    const items = await res.json();
    return { posts: items.filter((p) => !hasExcluded(p)), totalPages };
  }

  async function fetchPost(id) {
    const url = `${BASE}/posts/${id}?_embed=1`;
    const res = await fetch(url, { credentials:"omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Build card
  function buildCardElement(p) {
    let media = featuredImage(p) || firstImgFromHTML(p.excerpt?.rendered) || "";
    const author = esc(getAuthor(p));
    const date = ordinalDate(p.date);

    const el = document.createElement("div");
    el.className = "card";
    el.dataset.postId = p.id;
    el.innerHTML = `
      ${ media
          ? `<a href="#/post/${p.id}"><img class="thumb" src="${media}" alt="" loading="lazy" decoding="async" sizes="(max-width:600px) 100vw, 33vw"></a>`
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

  // Scroll restore (anchor or absolute)
  function restoreHomeScroll() {
    const cache = window.__okCache || {};
    const targetId = cache.scrollAnchorPostId;
    const targetY = cache.scrollY || 0;
    requestAnimationFrame(() => {
      if (targetId) {
        const card = document.querySelector(`.card[data-post-id="${CSS.escape(String(targetId))}"]`);
        if (card) {
          const y = Math.max(0, card.getBoundingClientRect().top + window.scrollY - 8);
          window.scrollTo(0,y); return;
        }
      }
      window.scrollTo(0,targetY);
    });
  }

  // ===== Home (infinite scroll + button + fill-page strategy) =====
  async function renderHome({ search = "" } = {}) {
    const qFromHash = parseQueryFromHash();
    const effectiveSearch = (search || qFromHash || "").trim();
    const key = effectiveSearch.toLowerCase();

    // ✅ do NOT wipe cache when we're returning from detail
    const returning = sessionStorage.getItem("__okReturning") === "1";
    if (window.__okCache.searchKey !== key && !returning) {
      window.__okCache = { posts: [], page: 1, totalPages: 1, scrollY: 0, scrollAnchorPostId: null, searchKey: key };
      saveHomeCache();
    } else {
      window.__okCache.searchKey = key;
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

    // ✅ Remember which card was clicked & current scroll (for solid Back)
    grid.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#/post/"]');
      if (!a) return;
      const id = a.getAttribute("href").split("/")[2]?.split("?")[0];
      if (!id) return;
      try {
        window.__okCache.scrollAnchorPostId = isNaN(+id) ? id : +id;
        window.__okCache.scrollY = window.scrollY || 0;
        window.__okCache.returningFromDetail = true;
        saveHomeCache();
        sessionStorage.setItem("__okReturning", "1");
      } catch {}
    });
    // Debounced search → update hash
    let tId=null;
    searchBox.addEventListener("input", () => {
      const val = searchBox.value.trim();
      if (tId) clearTimeout(tId);
      tId = setTimeout(() => setQueryInHash(val), 250);
    });

    // Replay cache
    if (window.__okCache.posts.length) {
      const frag = document.createDocumentFragment();
      window.__okCache.posts.forEach(p => frag.appendChild(buildCardElement(p)));
      grid.appendChild(frag);
      if (page > totalPages) { loadMore.textContent = "No more posts."; loadMore.disabled = true; }
      restoreHomeScroll();
    }

    async function load() {
      if (loading) return;
      loading = true;
      loadMore.disabled = true; loadMore.textContent = "Loading…";
      try {
        const targetAdd = PER_PAGE;
        let added = 0;

        while (added < targetAdd && page <= totalPages) {
          const { posts, totalPages: tp } = await fetchPosts({ page, search: effectiveSearch });
          totalPages = tp || 1;

          const frag = document.createDocumentFragment();
          for (const p of posts) {
            frag.appendChild(buildCardElement(p));
            window.__okCache.posts.push(p);
            added++;
          }
          if (frag.childNodes.length) grid.appendChild(frag);

          page++;
          window.__okCache.page = page;
          window.__okCache.totalPages = totalPages;
          saveHomeCache();

          if (page > totalPages) break;
        }

        const done = page > totalPages;
        if (done) { loadMore.textContent = "No more posts."; loadMore.disabled = true; }
        else { loadMore.textContent = "Load more"; loadMore.disabled = false; }
      } catch(e){ showError(`Failed to load posts: ${e.message}`); loadMore.textContent = "Retry"; loadMore.disabled = false; }
      finally { loading = false; }
    }

    loadMore?.addEventListener("click", load);

    if (returning) {
      sessionStorage.removeItem("__okReturning");
      requestAnimationFrame(() => {
        restoreHomeScroll();
        if ("IntersectionObserver" in window && sentinel) {
          const obs = new IntersectionObserver((entries) => {
            for (const entry of entries) if (entry.isIntersecting) {
              if (!loading && page <= totalPages) load();
            }
          }, { rootMargin: "600px 0px 600px 0px" });
          obs.observe(sentinel);
        }
      });
    } else {
      if ("IntersectionObserver" in window && sentinel) {
        const obs = new IntersectionObserver((entries) => {
          for (const entry of entries) if (entry.isIntersecting) {
            if (!loading && page <= totalPages) load();
          }
        }, { rootMargin: "600px 0px 600px 0px" });
        obs.observe(sentinel);
      }
      if (!window.__okCache.posts.length) load();
    }
  }

  // ===== Post detail =====
  async function renderPost(id) {
    try { window.__okCache.scrollY = window.scrollY || 0; saveHomeCache(); } catch {}
    try {
      window.__okCache.scrollAnchorPostId = isNaN(+id) ? id : +id;
      window.__okCache.returningFromDetail = true;
      saveHomeCache();
      sessionStorage.setItem("__okReturning", "1");
    } catch {}

    app.innerHTML = `<p class="center">Loading post…</p>`;
    try {
      const p = await fetchPost(id);
      if (!p) return;

      if (hasExcluded(p)) {
        app.innerHTML = `<div class="error-banner"><button class="close">×</button>This post is not available.</div>`;
        return;
      }

      const author = esc(getAuthor(p));
      const date = ordinalDate(p.date);

      const rawHtml = p.content?.rendered || "";
      const normalizedHtml = normalizeContent(rawHtml);

      let hero = featuredImage(p) || firstImgFromHTML(normalizedHtml) || "";
      const primaryVid = findPrimaryVideoUrl(normalizedHtml);
      const heroBlock = hero
        ? (primaryVid
            ? `<a href="${primaryVid.url}" target="_blank" rel="noopener"><img class="hero" src="${hero}" alt="" loading="lazy" decoding="async"></a>`
            : `<img class="hero" src="${hero}" alt="" loading="lazy" decoding="async">`)
        : "";

      app.innerHTML = `
        <article class="post">
          <p><a href="#/" class="btn" style="margin-bottom:12px">← Back to posts</a></p>
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">
            ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
            <span class="date">${date}</span>
          </div>
          ${heroBlock}
          <div class="content">${normalizedHtml}</div>
          <p><a href="#/" class="btn" style="margin-top:16px">← Back to posts</a></p>
        </article>`;

      document.querySelectorAll('.post a[href^="#/"]').forEach(a=>{
        a.removeAttribute("target");
        a.removeAttribute("rel");
      });

      hardenLinks(document.querySelector(".post"));

      const heroImg = document.querySelector(".post img.hero");
      if (heroImg) heroImg.addEventListener("error", () => heroImg.closest("a")?.remove() || heroImg.remove(), { once: true });

    } catch(e){
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Error loading post: ${e.message}</div>`;
    }
  }

  // ===== Router =====
  function router(){
    try{
      const hash = location.hash || "#/";
      if (hash.startsWith("#/post/")) {
        const id = hash.split("/")[2]?.split("?")[0];
        renderPost(id); return;
      }
      renderHome({ search: parseQueryFromHash() });
    } catch(e){ showError(`Router crash: ${e?.message || e}`); }
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("load", router);
})();
