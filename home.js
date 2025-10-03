// home.js — post summary grid (perf-tuned, authors/images via api helpers)

import {
  fetchLeanPostsPage,
  getCartoonCategoryId,
  getFeaturedImage,
  getAuthorName,
  PER_PAGE,
} from "./api.js";
import { decodeEntities, ordinalDate } from "./shared.js";

// ---------- State ----------
const st = {
  page: 1,
  loading: false,
  ended: false,
  io: null,                // IntersectionObserver
  sentinel: null,
  container: null,         // #app .container
  grid: null,              // .grid element
  hydratedFromCache: false,
  ids: new Set(),          // track rendered post IDs to prevent duplicates
  abort: null,             // route-level AbortController
  // Cache keys
  kPage: (p) => `__home_page_${p}`,
  kScroll: "__home_scrollY`,
};

// ---------- Abort management ----------
function resetAbort() {
  try { st.abort?.abort(); } catch {}
  st.abort = new AbortController();
  return st.abort.signal;
}

// ---------- DOM helpers ----------
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

function savePageHTMLToCache(page, html) {
  try { sessionStorage.setItem(st.kPage(page), html); } catch {}
}
function loadPageHTMLFromCache(page) {
  try { return sessionStorage.getItem(st.kPage(page)) || ""; } catch { return ""; }
}
function saveScrollPosition() {
  try { sessionStorage.setItem(st.kScroll, String(window.scrollY || 0)); } catch {}
}
function restoreScrollPosition() {
  try {
    const y = parseFloat(sessionStorage.getItem(st.kScroll) || "0");
    if (!isNaN(y) && y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
  } catch {}
}

// Seed IDs from existing DOM (after cache hydrate)
function seedIdsFromDOM() {
  if (!st.grid) return;
  st.ids.clear();
  st.grid.querySelectorAll(".card[data-id]").forEach(card => {
    const id = parseInt(card.getAttribute("data-id"), 10);
    if (!isNaN(id)) st.ids.add(id);
  });
}

// ---------- Client-side backup cartoon filter ----------
function filterOutCartoons(posts, cartoonId) {
  if (!Array.isArray(posts) || !posts.length) return posts;
  return posts.filter((p) => {
    const cats = Array.isArray(p.categories) ? p.categories : [];
    const byId = cartoonId && cats.includes(cartoonId);
    let bySlug = false;
    const terms = p?._embedded?.["wp:term"];
    if (terms && Array.isArray(terms)) {
      for (const arr of terms) {
        if (Array.isArray(arr)) {
          for (const term of arr) {
            if (term?.taxonomy === "category" && term?.slug === "cartoon") { bySlug = true; break; }
          }
        }
        if (bySlug) break;
      }
    }
    return !(byId || bySlug);
  });
}

// ---------- Card ----------
function renderCard(post) {
  const id = post.id;
  const title = decodeEntities(post?.title?.rendered || "");
  const dateText = ordinalDate(post?.date || new Date().toISOString());
  const author = getAuthorName(post) || "";
  const thumb = getFeaturedImage(post) || "icon.png";

  const card = h("article", { class: "card", "data-id": id });

  if (thumb) {
    const img = h("img", {
      class: "thumb",
      src: thumb,
      alt: "",
      loading: "lazy",
      decoding: "async",
      fetchpriority: "low"
    });
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

  // Excerpt (strip HTML → text)
  const rawEx = post?.excerpt?.rendered || "";
  const ex = decodeEntities(
    String(rawEx).replace(/<\/?[^>]+(>|$)/g, "").replace(/\s+/g, " ").trim()
  );
  if (ex) body.appendChild(h("div", { class: "excerpt" }, ex));

  card.appendChild(body);
  return card;
}

function renderGridFromPosts(posts) {
  if (!st.grid) return;
  const frag = document.createDocumentFragment();
  for (const p of posts) {
    if (!p || typeof p.id !== "number") continue;
    if (st.ids.has(p.id)) continue;       // dedupe
    st.ids.add(p.id);
    frag.appendChild(renderCard(p));
  }
  if (frag.childNodes.length) st.grid.appendChild(frag);
}

// ---------- Page load ----------
async function loadPage(page, signal) {
  // Cache-first for page 1
  if (page === 1 && st.grid && !st.grid.children.length) {
    const cached = loadPageHTMLFromCache(1);
    if (cached) {
      st.grid.innerHTML = cached;
      st.hydratedFromCache = true;
      seedIdsFromDOM();
    }
  }

  // Server normally excludes cartoons; keep client backup
  const cartoonId = await getCartoonCategoryId(signal).catch(() => 0);

  const posts = await fetchLeanPostsPage(page, signal);
  const clean = filterOutCartoons(posts, cartoonId);

  renderGridFromPosts(clean);

  if (page === 1 && st.grid) {
    // Always refresh the cache with merged deduped HTML
    savePageHTMLToCache(1, st.grid.innerHTML);
  }

  return { hasMore: Array.isArray(posts) && posts.length === PER_PAGE };
}

// ---------- Infinite scroll + prefetch ----------
function setupObserver() {
  if (st.io) return;
  st.io = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (st.loading || st.ended) return;
      st.loading = true;
      const signal = resetAbort();
      try {
        st.page += 1;
        const { hasMore } = await loadPage(st.page, signal);
        if (!hasMore) {
          st.ended = true;
          st.sentinel?.remove();
          st.sentinel = null;
          st.io?.disconnect();
        } else {
          // Prefetch next page JSON in idle time
          requestIdleCallback(() => {
            const s = new AbortController().signal;
            fetchLeanPostsPage(st.page + 1, s).catch(() => {});
          }, { timeout: 1500 });
        }
      } catch {
        // noop; user can scroll again to retry
      } finally {
        st.loading = false;
      }
    }
  }, { rootMargin: "1200px 0px" }); // earlier prefetch

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
  const app = document.getElementById("app");
  if (!app) return;

  // Shell (persist across nav for scroll restore)
  if (!st.container) {
    st.container = h("div", { class: "container" });
    st.grid = h("div", { class: "grid" });
    st.container.appendChild(st.grid);
  }
  app.innerHTML = "";
  app.appendChild(st.container);

  // Restore scroll when coming back from detail
  restoreScrollPosition();

  // Bootstrap first page once per navigation
  if (!st.grid.children.length) {
    st.loading = true;
    try {
      st.page = 1;
      st.ended = false;
      st.ids.clear();
      st.hydratedFromCache = false;

      const signal = resetAbort();
      const { hasMore } = await loadPage(1, signal);
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
    seedIdsFromDOM();
    ensureSentinel();
    setupObserver();
  }

  // Persist scroll on leave
  const save = () => saveScrollPosition();
  window.removeEventListener("beforeunload", save);
  window.removeEventListener("hashchange", save);
  window.addEventListener("beforeunload", save, { once: true });
  window.addEventListener("hashchange", save, { once: true });

  // Prune big in-memory arrays over long sessions
  if (st.ids.size > 200) {
    const keep = Array.from(st.grid.querySelectorAll(".card[data-id]"))
      .slice(-200)
      .map(c => parseInt(c.getAttribute("data-id"), 10))
      .filter(n => !isNaN(n));
    st.ids = new Set(keep);
  }
}
