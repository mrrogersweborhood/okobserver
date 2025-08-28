// app.js — OkObserver (v1.32)
// Focus: Newsmakers hero always visible (embed or clear fallback).
// Also keeps: absolute BASE (GH Pages safe), router guard, robust featured images,
// infinite scroll, AbortControllers removed for simplicity, Cartoon exclusion,
// author/date/tags, new-tab links, oEmbed thumbs, FB watchdog.
const APP_VERSION = "v1.32";
window.APP_VERSION = APP_VERSION;
console.info("OkObserver app loaded", APP_VERSION);

(() => {
  // Hard-pin absolute API base to avoid GH Pages 404s
  let BASE = "https://okobserver.org/wp-json/wp/v2";

  const PER_PAGE = 12;
  const EXCLUDE_CAT_NAME = "cartoon";
  const NEWSMAKERS_CAT_NAME = "newsmakers";

  const app = document.getElementById("app");

  // ---------------- Error UI ----------------
  function showError(message) {
    if (!app) return;
    const text = (message && message.message) ? message.message : String(message || "Something went wrong.");
    const banner = document.createElement("div");
    banner.className = "error-banner";
    banner.innerHTML = `<button class="close" aria-label="Dismiss error" title="Dismiss">×</button>${text}`;
    app.prepend(banner);
  }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".error-banner .close");
    if (btn) btn.closest(".error-banner")?.remove();
  });

  // ---------------- Utils ----------------
  const esc = (s) =>
    (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const getAuthorName = (post) =>
    post?._embedded?.author?.[0]?.name ? String(post._embedded.author[0].name) : "";

  const hasExcludedCategory = (post) => {
    const cats = post?._embedded?.["wp:term"]?.[0] || [];
    return cats.some((c) => (c?.name || "").toLowerCase() === EXCLUDE_CAT_NAME);
  };

  const isInCategory = (post, catNameLower) => {
    const cats = post?._embedded?.["wp:term"]?.[0] || [];
    return cats.some((c) => {
      const name = (c?.name || "").toLowerCase();
      const slug = (c?.slug || "").toLowerCase();
      return name === catNameLower || slug === catNameLower;
    });
  };

  const getPostTags = (embeddedTerms) => {
    if (!embeddedTerms || !Array.isArray(embeddedTerms)) return [];
    return embeddedTerms.flat().filter((t) => t?.taxonomy === "post_tag");
  };

  function formatDateWithOrdinal(dateString) {
    const d = new Date(dateString);
    const day = d.getDate();
    const month = d.toLocaleString("en-US", { month: "long" });
    const year = d.getFullYear();
    const suffix = (n) => {
      if (n > 3 && n < 21) return "th";
      switch (n % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; }
    };
    return `${month} ${day}${suffix(day)}, ${year}`;
  }

  function apiOrigin() {
    try { return BASE.startsWith("http") ? new URL(BASE).origin : location.origin; }
    catch { return "https://okobserver.org"; }
  }

  function extractFirstEmbedUrlFromHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    const w = div.querySelector(".wp-block-embed__wrapper");
    if (w) {
      const t = (w.textContent || "").trim();
      if (/^https?:\/\/\S+$/.test(t)) return t;
    }
    const p = Array.from(div.querySelectorAll("p")).find(el => {
      const t = el.textContent.trim();
      return /^https?:\/\/\S+$/.test(t) && el.children.length === 0;
    });
    if (p) return p.textContent.trim();
    const a = Array.from(div.querySelectorAll("a[href]")).find(el =>
      /(facebook\.com|fb\.watch|youtu\.be|youtube\.com|vimeo\.com)/i.test(el.href)
    );
    if (a) return a.href;
    return null;
  }

  function extractFirstImageSrcFromHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    const img = div.querySelector("img");
    if (!img) return null;
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const last = srcset.split(",").map(s => s.trim()).pop();
      const url = last?.split(" ")?.[0];
      if (url) return url;
    }
    return img.getAttribute("data-src") || img.getAttribute("src") || null;
  }

  // ✅ Robust featured image picker
  function getBestFeaturedImage(post) {
    const m = post?._embedded?.["wp:featuredmedia"]?.[0];
    if (!m) return "";
    const sizes = m.media_details?.sizes || {};
    return (
      sizes?.["2048x2048"]?.source_url ||
      sizes?.["1536x1536"]?.source_url ||
      sizes?.full?.source_url ||
      sizes?.large?.source_url ||
      sizes?.medium_large?.source_url ||
      sizes?.medium?.source_url ||
      m.source_url ||
      ""
    );
  }

  async function getOembedThumb(url) {
    if (!url) return null;
    try {
      const origin = apiOrigin();
      const res = await fetch(`${origin}/wp-json/oembed/1.0/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.thumbnail_url || null;
    } catch { return null; }
  }

  // --- Facebook watchdog (fallback) ---
  function attachFbWatchdog(iframe, linkHref) {
    const fallback = document.createElement("div");
    fallback.style.cssText = "color:#900;background:#ffeaea;border:1px solid #f9caca;border-radius:8px;padding:10px;margin-top:8px;font-size:.9em;display:none";
    const href = linkHref || (()=>{
      try { const u = new URL(iframe.src, location.href); return u.searchParams.get("href") || ""; } catch { return ""; }
    })() || "https://www.facebook.com/";
    fallback.innerHTML = `
      Facebook embed didn’t load. This is often caused by a browser extension or privacy setting.
      <div style="margin-top:6px">
        <a href="${href}" target="_blank" rel="noopener" class="btn" style="padding:4px 10px">Open on Facebook</a>
      </div>`;
    iframe.parentElement.appendChild(fallback);
    let loaded = false;
    const quick = setTimeout(() => {
      const h = iframe.clientHeight, w = iframe.clientWidth;
      if (!loaded && (h === 0 || w === 0)) fallback.style.display = "block";
    }, 1500);
    const hard = setTimeout(() => { if (!loaded) fallback.style.display = "block"; }, 3000);
    iframe.addEventListener("load", () => { loaded = true; clearTimeout(quick); clearTimeout(hard); });
    iframe.addEventListener("error", () => { loaded = false; fallback.style.display = "block"; });
  }

  // ---------------- Embeds Enhancer ----------------
  function enhanceEmbeds(root) {
    if (!root) return;

    // All anchors: open in new tab
    root.querySelectorAll("a[href]").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });

    // Convert Facebook SDK blocks to plugin iframes
    root.querySelectorAll('div.fb-video[data-href], div.fb-post[data-href]').forEach((el) => {
      const href = el.getAttribute('data-href'); if (!href) return;
      const isVideo = el.classList.contains('fb-video');
      const width = 720, height = 405;
      const plugin = isVideo ? "video" : "post";
      const showText = isVideo ? "false" : "true";
      const src = `https://www.facebook.com/plugins/${plugin}.php?href=${encodeURIComponent(href)}&show_text=${showText}&width=${width}&height=${height}`;

      const wrap = document.createElement("div"); wrap.className = "embed-wrap";
      const iframe = document.createElement("iframe");
      iframe.loading = "lazy";
      iframe.allow = "autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share";
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      iframe.width = String(width); iframe.height = String(height);
      iframe.src = src;

      wrap.appendChild(iframe);
      attachFbWatchdog(iframe, href);
      el.replaceWith(wrap);
    });

    // Bare embed URLs (FB/YT/Vimeo) in wrappers or lone <p>
    const candidates = [
      ...root.querySelectorAll(".wp-block-embed__wrapper"),
      ...Array.from(root.querySelectorAll("p")).filter(p => {
        const t = p.textContent.trim();
        return /^https?:\/\/\S+$/.test(t) && p.children.length === 0;
      })
    ];

    candidates.forEach(async (node) => {
      const url = node.textContent.trim();
      if (!/^https?:\/\/\S+$/.test(url)) return;

      // Facebook → plugin iframe
      if (/(?:^|\.)facebook\.com|fb\.watch/i.test(url)) {
        const wrap = document.createElement("div"); wrap.className = "embed-wrap";
        const isVideo = /\/videos?\//i.test(url) || /\/reel\//i.test(url) || /fb\.watch/i.test(url);
        const width = 720, height = 405;
        const plugin = isVideo ? "video" : "post";
        const showText = isVideo ? "false" : "true";
        const src = `https://www.facebook.com/plugins/${plugin}.php?href=${encodeURIComponent(url)}&show_text=${showText}&width=${width}&height=${height}`;

        const iframe = document.createElement("iframe");
        iframe.loading = "lazy";
        iframe.allow = "autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share";
        iframe.setAttribute("allowfullscreen", "");
        iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        iframe.width = String(width); iframe.height = String(height);
        iframe.src = src;

        wrap.appendChild(iframe);
        attachFbWatchdog(iframe, url);
        node.replaceWith(wrap);
        return;
      }

      // oEmbed proxy for others; if blocked, we still normalize below
      try {
        const origin = apiOrigin();
        const res = await fetch(`${origin}/wp-json/oembed/1.0/proxy?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.html) {
          const wrap = document.createElement("div"); wrap.className = "embed-wrap";
          wrap.innerHTML = data.html;
          node.replaceWith(wrap);
          // Re-run to normalize the inner iframe
          enhanceEmbeds(wrap);
          return;
        }
      } catch (e) {
        // Manual YouTube/Vimeo fallback
        if (/youtube\.com|youtu\.be/i.test(url)) {
          const id = url.match(/(?:v=|\/)([A-Za-z0-9_-]{11})/)?.[1];
          if (id) {
            const wrap = document.createElement("div"); wrap.className = "embed-wrap";
            wrap.innerHTML = `<iframe loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen src="https://www.youtube.com/embed/${id}"></iframe>`;
            node.replaceWith(wrap);
            return;
          }
        } else if (/vimeo\.com/i.test(url)) {
          const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
          if (id) {
            const wrap = document.createElement("div"); wrap.className = "embed-wrap";
            wrap.innerHTML = `<iframe loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen src="https://player.vimeo.com/video/${id}"></iframe>`;
            node.replaceWith(wrap);
            return;
          }
        }
        console.warn("oEmbed failed for", url, e);
      }
    });

    // Normalize any existing iframes and ensure .embed-wrap wrapper is present
    root.querySelectorAll("iframe").forEach((f) => {
      if (!f.hasAttribute("allow")) {
        f.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
      }
      f.setAttribute("allowfullscreen", "");
      if (!f.hasAttribute("loading")) f.setAttribute("loading", "lazy");
      if (!f.hasAttribute("referrerpolicy")) f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");

      const parentIsWrapper = f.parentElement && f.parentElement.classList.contains("embed-wrap");
      if (!parentIsWrapper) {
        const wrap = document.createElement("div");
        wrap.className = "embed-wrap";
        f.replaceWith(wrap);
        wrap.appendChild(f);
      }

      const src = (f.getAttribute("src") || "").toLowerCase();
      if (/facebook\.com\/plugins\/(video|post)\.php/.test(src)) {
        attachFbWatchdog(f, /* linkHref */ "");
      }
    });

    // Make <video> elements sane
    root.querySelectorAll("video").forEach((v) => {
      v.setAttribute("controls", "");
      if (!v.hasAttribute("playsinline")) v.setAttribute("playsinline", "");
      if (!v.hasAttribute("preload")) v.setAttribute("preload", "metadata");
      v.removeAttribute("width"); v.removeAttribute("height");
      if (!v.hasAttribute("loading")) v.setAttribute("loading", "lazy");
    });
  }

  // ---------------- API helpers ----------------
  async function fetchPosts({ page = 1, search = "" } = {}) {
    const url = `${BASE}/posts?_embed=1&per_page=${PER_PAGE}&page=${page}${search ? "&search="+encodeURIComponent(search) : ""}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const totalPages = Number(res.headers.get("X-WP-TotalPages") || "1");
      const items = await res.json();
      const posts = items.filter((p) => !hasExcludedCategory(p));
      return { posts, totalPages };
    } catch (err) {
      showError(`Failed to load posts: ${err?.message || err}`);
      return { posts: [], totalPages: 1 };
    }
  }

  async function fetchPostById(id) {
    try {
      const res = await fetch(`${BASE}/posts/${id}?_embed=1`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      showError(`Error loading post: ${err?.message || err}`);
      return null;
    }
  }

  // ---------------- Views ----------------
  const HomeCache = { html: "", scrollY: 0, hasData: false, search: "", page: 1 };
  const seenIds = new Set();

  function renderHome({ search = "" } = {}) {
    const state = window._homeState = { search, page: 1, totalPages: Infinity, loading: false, ended: false };
    seenIds.clear();

    app.innerHTML = `
      <h1>Latest Posts</h1>
      <div id="grid" class="grid"></div>
      <div id="status" class="center" style="margin:10px 0; font-size:.9em;"></div>
      <div id="sentinel" style="height:1px;"></div>
    `;

    const grid = document.getElementById("grid");
    const statusEl = document.getElementById("status");
    const sentinel = document.getElementById("sentinel");
    const setStatus = (msg) => { statusEl.textContent = msg || ""; };

    async function loadNextBatch(targetCount = PER_PAGE) {
      if (state.loading || state.ended) return;
      state.loading = true;
      setStatus("Loading…");
      try {
        let added = 0;
        while (added < targetCount && !state.ended) {
          const { posts, totalPages } = await fetchPosts({ page: state.page, search: state.search });
          if (state.totalPages === Infinity) state.totalPages = totalPages || 1;
          for (const p of posts) {
            if (seenIds.has(p.id)) continue;
            seenIds.add(p.id);

            // ✅ Card image priority: featured -> (Newsmakers video thumb) -> first <img> in content -> then excerpt -> blank
            let media = getBestFeaturedImage(p);
            if (!media && isInCategory(p, NEWSMAKERS_CAT_NAME)) {
              const vUrl = extractFirstEmbedUrlFromHtml(p.content?.rendered);
              if (vUrl) {
                const thumb = await getOembedThumb(vUrl);
                if (thumb) media = thumb;
              }
            }
            if (!media) {
              media = extractFirstImageSrcFromHtml(p.content?.rendered) ||
                      extractFirstImageSrcFromHtml(p.excerpt?.rendered) || "";
            }

            const author = esc(getAuthorName(p));
            const date = formatDateWithOrdinal(p.date);

            const card = document.createElement("div");
            card.className = "card";
            card.innerHTML = `
              ${ media
                  ? `<a href="#/post/${p.id}"><img class="thumb" src="${media}" alt=""></a>`
                  : `<a href="#/post/${p.id}"><div class="thumb"></div></a>` }
              <div class="card-body">
                <h2 class="title">
                  <a href="#/post/${p.id}" style="color:inherit;text-decoration:none;">
                    ${p.title.rendered}
                  </a>
                </h2>
                <div class="meta-author-date">
                  ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
                  <span class="date">${date}</span>
                </div>
                <div class="excerpt">${p.excerpt.rendered}</div>
                <a href="#/post/${p.id}" class="btn">Read more</a>
              </div>
            `;
            grid.appendChild(card);

            // ✅ Thumbnail error → graceful fallback
            const thumbImg = card.querySelector("img.thumb");
            if (thumbImg) {
              thumbImg.addEventListener("error", () => {
                const a = thumbImg.closest("a");
                if (a) a.innerHTML = `<div class="thumb"></div>`;
              }, { once: true });
            }

            // Harden links/embeds inside excerpt
            enhanceEmbeds(card.querySelector(".excerpt"));

            added++;
          }
          state.page++;
          if (state.page > state.totalPages) state.ended = true;
        }

        HomeCache.html = app.innerHTML;
        HomeCache.hasData = grid.children.length > 0;
        HomeCache.page = state.page;
        HomeCache.search = state.search;
        HomeCache.scrollY = window.scrollY;

        setStatus(state.ended ? (HomeCache.hasData ? "No more posts." : "No posts found.") : "");
      } catch (e) {
        showError(e);
        setStatus("Failed to load.");
      } finally { state.loading = false; }
    }

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !state.loading && !state.ended) {
          loadNextBatch(Math.ceil(PER_PAGE/2));
        }
      }
    }, { root: null, rootMargin: "600px 0px 600px 0px", threshold: 0 });

    io.observe(sentinel);
    loadNextBatch(PER_PAGE);
  }

  async function renderPost(id) {
    app.innerHTML = `<p class="center">Loading post…</p>`;
    try {
      const p = await fetchPostById(id);
      if (!p) return;
      if (hasExcludedCategory(p)) {
        app.innerHTML = `<div class="error-banner"><button class="close">×</button>This post is not available.</div>`;
        return;
      }

      const author = esc(getAuthorName(p));
      const date = formatDateWithOrdinal(p.date);
      const tags = getPostTags(p._embedded?.["wp:term"]);
      const contentHtml = p.content?.rendered || "";
      const isNewsmakers = isInCategory(p, NEWSMAKERS_CAT_NAME);

      // --- HERO decision ---
      let heroHtml = "";
      const providerUrl = extractFirstEmbedUrlFromHtml(contentHtml);

      if (isNewsmakers && providerUrl) {
        // Prefer to embed the provider player
        if (/(?:^|\.)facebook\.com|fb\.watch/i.test(providerUrl)) {
          const width = 720, height = 405;
          const isVideo = /\/videos?\//i.test(providerUrl) || /\/reel\//i.test(providerUrl) || /fb\.watch/i.test(providerUrl);
          const plugin = isVideo ? "video" : "post";
          const showText = isVideo ? "false" : "true";
          const src = `https://www.facebook.com/plugins/${plugin}.php?href=${encodeURIComponent(providerUrl)}&show_text=${showText}&width=${width}&height=${height}`;
          heroHtml = `
            <div class="embed-wrap">
              <iframe loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowfullscreen referrerpolicy="strict-origin-when-cross-origin"
                width="${width}" height="${height}" src="${src}"></iframe>
            </div>
            <div style="font-size:.85em;color:#555;margin-top:6px">
              If the player doesn’t appear, <a class="btn" style="padding:4px 10px" target="_blank" rel="noopener" href="${providerUrl}">Open on Facebook</a>
            </div>`;
          // Attach watchdog after insertion
          // (done in enhanceEmbeds when it normalizes iframes below)
        } else if (/youtube\.com|youtu\.be/i.test(providerUrl)) {
          const id = providerUrl.match(/(?:v=|\/)([A-Za-z0-9_-]{11})/)?.[1];
          if (id) {
            heroHtml = `
              <div class="embed-wrap">
                <iframe loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowfullscreen src="https://www.youtube.com/embed/${id}"></iframe>
              </div>`;
          }
        } else if (/vimeo\.com/i.test(providerUrl)) {
          const id = providerUrl.match(/vimeo\.com\/(\d+)/)?.[1];
          if (id) {
            heroHtml = `
              <div class="embed-wrap">
                <iframe loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen
                  src="https://player.vimeo.com/video/${id}"></iframe>
              </div>`;
          }
        }

        // If for some reason we couldn't build an embed, show a visible FB placeholder button
        if (!heroHtml) {
          heroHtml = `
            <a href="${providerUrl}" target="_blank" rel="noopener"
              style="display:block;border-radius:10px;overflow:hidden;margin:16px 0;text-decoration:none">
              <div class="embed-wrap" style="background:#1877f2;display:flex;align-items:center;justify-content:center;">
                <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
                  <circle cx="48" cy="48" r="46" fill="rgba(255,255,255,0.2)" stroke="white" stroke-width="2"/>
                  <polygon points="40,30 72,48 40,66" fill="white"/>
                </svg>
              </div>
            </a>
            <div style="font-size:.85em;color:#555;margin-top:6px">Open the video on Facebook if the player doesn’t appear.</div>`;
        }
      }

      // Non-Newsmakers hero (optional featured image)
      if (!heroHtml) {
        const heroSrc = getBestFeaturedImage(p) ||
                        extractFirstImageSrcFromHtml(contentHtml) || "";
        if (heroSrc) {
          heroHtml = `<img class="hero" src="${heroSrc}" alt="" loading="lazy" style="background:#000;border-radius:10px;max-height:420px;object-fit:cover;width:100%;margin:16px 0;">`;
        }
      }

      app.innerHTML = `
        <article class="post">
          <p><a href="#/" class="btn" style="margin-bottom:12px">← Back to posts</a></p>
          <h1>${p.title.rendered}</h1>
          <div class="meta-author-date">
            ${author ? `<span class="author"><strong>${author}</strong></span>` : ""}
            <span class="date">${date}</span>
          </div>
          ${heroHtml}
          <div class="content">${contentHtml}</div>
          ${tags.length ? `<div class="tags"><span style="margin-right:6px;">Tags:</span>${tags.map((t) => {
              const name = esc(t.name || "tag");
              const slug = t.slug || "";
              const href = slug ? `https://okobserver.org/tag/${slug}/` : "#";
              return `<a class="tag-chip" href="${href}" target="_blank" rel="noopener">${name}</a>`;
            }).join("")}</div>` : ""}
          <p><a href="#/" class="btn" style="margin-top:16px">← Back to posts</a></p>
        </article>
      `;

      // Enhance embeds inside the content (wrap iframes, FB conversion, watchdog)
      enhanceEmbeds(app.querySelector(".content"));
      // And also normalize the hero embed iframe we inserted (ensures watchdog binds)
      enhanceEmbeds(app.querySelector(".post"));
    } catch (err) {
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Error loading post: ${err?.message || err}</div>`;
    }
  }

  function renderAbout(){
    app.innerHTML = `
      <article class="post">
        <h1>About</h1>
        <p><strong>OkObserver</strong> is an unofficial reader for okobserver.org.</p>
        <p>For official info, visit <a href="https://okobserver.org" target="_blank" rel="noopener">okobserver.org</a>.</p>
      </article>`;
  }

  // ---------------- Router ----------------
  function router() {
    try {
      const hash = location.hash || "#/";
      if (hash === "#/" || hash === "") {
        if (HomeCache.hasData && HomeCache.html) {
          app.innerHTML = HomeCache.html;
          requestAnimationFrame(() => window.scrollTo(0, HomeCache.scrollY || 0));
          return;
        }
        renderHome({ search: HomeCache.search || "" });
        return;
      }
      if (hash.startsWith("#/post/")) {
        if (app && app.querySelector("#grid")) {
          HomeCache.scrollY = window.scrollY; HomeCache.html = app.innerHTML; HomeCache.hasData = true;
        }
        const id = hash.split("/")[2]?.split("?")[0];
        renderPost(id);
        return;
      }
      if (hash.startsWith("#/search")) {
        const q = decodeURIComponent((hash.split("?q=")[1] || "").trim());
        HomeCache.html = ""; HomeCache.hasData = false; HomeCache.search = q;
        renderHome({ search: q }); return;
      }
      if (hash === "#/about") { renderAbout(); return; }
      app.innerHTML = `<div class="error-banner"><button class="close">×</button>Page not found</div>`;
    } catch (e) {
      showError(`Router crash: ${e?.message || e}`);
    }
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("load", router);
  window.addEventListener("error", (e) => showError(`Runtime error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => showError(`Unhandled promise rejection: ${e.reason?.message || e.reason}`));
})();
