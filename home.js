// home.js — post summary grid (refactored to use shared.js utilities)

import { fetchLeanPostsPage, ensureCartoonCategoryId } from "./api.js";
import {
  decodeEntities,
  ordinalDate,
  selectHeroSrc,
} from "./shared.js";

// ---------- State ----------
const st = {
  page: 1,
  loading: false,
  ended: false,
  io: null,                // IntersectionObserver
  sentinel: null,
  container: null,         // #app .container
  grid: null,              // .grid element
  // cache keys
  kPage: (p) => `__home_page_${p}`,
  kScroll: "__home_scrollY",
  kCursor: "__home_cursorSel",
};

// ---------- Helpers ----------
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v, { passive: true });
    } else if (v !== false && v != null) {
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === "string") el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}

// Cache render output per page so we can rehydrate quickly
function savePageHTMLToCache(page, html) {
  try {
    sessionStorage.setItem(st.kPage(page), html);
  } catch {}
}
function loadPageHTMLFromCache(page) {
  try {
    return sessionStorage.getItem(st.kPage(page)) || "";
  } catch {
    return "";
  }
}

function saveScrollPosition() {
  try { sessionStorage.setItem(st.kScroll, String(window.scrollY || 0)); } catch {}
}
function restoreScrollPosition() {
  try {
    const y = parseFloat(sessionStorage.getItem(st.kScroll) || "0");
    if (!isNaN(y) && y > 0) {
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  } catch {}
}

// ---------- Grid rendering ----------
function renderCard(post) {
  const id = post.id;
  const title = decodeEntities(post?.title?.rendered || "");
  const dateText = ordinalDate(post?.date || new Date().toISOString());
  const author =
    post?._embedded?.author?.[0]?.name ||
    (Array.isArray(post?.authors) && post.authors[0]?.name) ||
    "";

  // Featured image (grid thumb): prefer medium_large/large; if missing, omit <img> entirely (no placeholder flicker)
  const media = post?._embedded?.["wp:featuredmedia"]?.[0];
  const thumb =
    media?.media_details?.sizes?.medium_large?.source_url ||
    media?.media_details?.sizes?.large?.source_url ||
    media?.source_url ||
    "";

  const card = h("article", { class: "card", "data-id": id });

  const img = thumb
    ? h(
        "img",
        {
          class: "thumb",
          src: thumb,
          alt: "",
        }
      )
    : null;

  // Only the image and the title are clickable → anchor wraps them individually
  if (img) {
    const aImg = h("a", { href: `#/post/${id}`, "aria-label": title }, img);
    card.appendChild(aImg);
  }

  const body = h("div", { class: "card-body" });

  const aTitle = h("a", { href: `#/post/${id}`, class: "title" }, title);
  body.appendChild(aTitle);

  const meta = h(
    "div",
    { class: "meta-author-date" },
    author ? h("strong", {}, author) : "",
    h("span", { class: "date" }, dateText)
  );
  body.appendChild(meta);

  // Excerpt (plain text; not clickable)
  const rawEx = post?.excerpt?.rendered || "";
  const ex = decodeEntities(
    String(rawEx)
      .replace(/<\/?[^>]+(>|$)/g, "") // strip tags
      .replace(/\s+/g, " ")
      .trim()
  );
  if (ex) body.appendChild(h("div", { class: "excerpt" }, ex));

  card.appendChild(body);
  return card;
}

function renderGridFromPosts(posts) {
  if (!st.grid) return;
  const frag = document.createDocumentFragment();
  posts.forEach((p) => frag.appendChild(renderCard(p)));
  st.grid.appendChild(frag);
}

// Client-side fallback cartoon filter (in case proxy didn’t exclude)
function filterOutCartoons(posts, cartoonId) {
  if (!Array.isArray(posts) || !posts.length) return posts;
  return posts.filter((p) => {
    // includes category id or an embedded term with slug 'cartoon'
    const cats = Array.isArray(p.categories) ? p.categories : [];
    const isCartoonId = cartoonId && cats.includes(cartoonId);
    let isCartoonSlug = false;
    const terms = p?._embedded?.["wp:term"];
    if (terms && Array.isArray(terms)) {
      for (const arr of terms) {
        if (Array.isArray(arr)) {
          for (const term of arr) {
            if (term?.taxonomy === "category" && term?.slug === "cartoon") {
              isCartoonSlug = true;
              break;
            }
          }
        }
        if (isCartoonSlug) break;
      }
    }
    return !isCartoonId && !isCartoonSlug;
  });
}

// ---------- Fetch + page assembly ----------
async function loadPage(page, signal) {
  // Try cache first
  const cached = loadPageHTMLFromCache(page);
  if (cached && st.grid && !st.grid.children.length) {
    // If this is the first paint, hydrate from cache so the page feels instant
    st.grid.innerHTML = cached;
    // Do not return; continue to fetch fresh posts to keep infinite scroll working
  }

  const cartoonId = await ensureCartoonCategoryId(signal).catch(() => 0);

  const data = await fetchLeanPostsPage(page, signal); // { posts, hasMore }
  let { posts, hasMore } = data || { posts: [], hasMore: false };

  // Safety: filter cartoons on client too
  posts = filterOutCartoons(posts, cartoonId);

  // Render
  renderGridFromPosts(posts);

  // Save the rendered HTML of this page (append-only)
  if (st.grid) {
    try {
      // Serialize only the nodes appended for this page to keep per-page caches light
      // (Simple approach: on first page just save entire grid; on next pages, slice from index)
      savePageHTMLToCache(page, st.grid.innerHTML);
    } catch {}
  }

  return { hasMore };
}

// ---------- Infinite scroll ----------
function setupObserver() {
  if (st.io) return;
  st.io = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (st.loading || st.ended) return;
      st.loading = true;
      try {
        st.page += 1;
        const ctrl = new AbortController();
        const { hasMore } = await loadPage(st.page, ctrl.signal);
        if (!hasMore) {
          st.ended = true;
          st.sentinel?.remove();
          st.sentinel = null;
          st.io?.disconnect();
        }
      } catch (e) {
        // swallow; user may scroll again to retry
      } finally {
        st.loading = false;
      }
    }
  }, { rootMargin: "800px 0px" });
  if (st.sentinel) st.io.observe(st.sentinel);
}

function ensureSentinel() {
  if (!st.container) return;
  if (!st.sentinel) {
    st.sentinel = h("div", { id: "infinite-sentinel", style: "height:1px" });
    st.container.appendChild(st.sentinel);
  }
  if (st.io && st.sentinel) st.io.observe(st.sentinel);
}

// ---------- Public: renderHome ----------
export async function renderHome() {
  // Build shell
  const app = document.getElementById("app");
  if (!app) return;

  // Container + grid (preserve if already exists so scroll restoration is meaningful)
  if (!st.container) {
    st.container = h("div", { class: "container" });
    st.grid = h("div", { class: "grid" });
    st.container.appendChild(st.grid);
    app.innerHTML = "";
    app.appendChild(st.container);
  } else {
    app.innerHTML = "";
    app.appendChild(st.container);
  }

  // If we’re returning from detail, restore scroll position
  restoreScrollPosition();

  // First page bootstrap if grid empty
  if (!st.grid.children.length) {
    st.loading = true;
    try {
      st.page = 1;
      st.ended = false;

      // Load first page
      const ctrl = new AbortController();
      const { hasMore } = await loadPage(1, ctrl.signal);

      // Ensure sentinel + observer for infinite scroll
      ensureSentinel();
      setupObserver();
      if (!hasMore) {
        st.ended = true;
        st.sentinel?.remove();
        st.sentinel = null;
      }
    } catch (e) {
      const msg = (e && e.message) ? e.message : "Failed to load.";
      st.container.appendChild(
        h("div", { class: "error-banner" },
          h("button", { class: "close", "aria-label": "Dismiss" }, "×"),
          document.createTextNode(`Home load failed: ${msg}`)
        )
      );
    } finally {
      st.loading = false;
    }
  } else {
    // We have grid content (from prior visit) — ensure observer exists
    ensureSentinel();
    setupObserver();
  }

  // Save scroll on unload/hash change so Back to posts restores exactly
  const save = () => saveScrollPosition();
  window.removeEventListener("beforeunload", save);
  window.removeEventListener("hashchange", save);
  window.addEventListener("beforeunload", save, { once: true });
  window.addEventListener("hashchange", save, { once: true });
}
