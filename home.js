// home.js — post summary grid (authors, featured images, infinite scroll) — dedupe-safe

import { fetchLeanPostsPage, getCartoonCategoryId } from "./api.js";
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
  // Cache keys
  kPage: (p) => `__home_page_${p}`,
  kScroll: "__home_scrollY",
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

// Seed the st.ids set by scanning existing cards (used after cache hydrate)
function seedIdsFromDOM() {
  if (!st.grid) return;
  st.ids.clear();
  st.grid.querySelectorAll(".card[data-id]").forEach(card => {
    const id = parseInt(card.getAttribute("data-id"), 10);
    if (!isNaN(id)) st.ids.add(id);
  });
}

// ---------- Grid rendering ----------
function renderCard(post) {
  const id = post.id;
  const title = decodeEntities(post?.title?.rendered || "");
  const dateText = ordinalDate(post?.date || new Date().toISOString());

  // Author from embed
  const author =
    post?._embedded?.author?.[0]?.name ||
    (Array.isArray(post?.authors) && post.authors[0]?.name) ||
    "";

  // Featured image (prefer medium_large/large; fallback to source_url)
  const media = post?._embedded?.["wp:featuredmedia"]?.[0];
  const thumb =
    media?.media_details?.sizes?.medium_large?.source_url ||
    media?.media_details?.sizes?.large?.source_url ||
    media?.source_url ||
    "";

  const card = h("article", { class: "card", "data-id": id });

  if (thumb) {
    const img = h("img", { class: "thumb", src: thumb, alt: "" });
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

  // Excerpt (plain text only; not clickable)
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
    if (st.ids.has(p.id)) continue;       // <-- skip duplicates
    st.ids.add(p.id);
    frag.appendChild(renderCard(p));
  }
  if (frag.childNodes.length) st.grid.appendChild(frag);
}

// Client-side fallback cartoon filter (if proxy didn’t exclude)
function filterOutCartoons(posts, cartoonId) {
  if (!Array.isArray(posts) || !posts.length) return posts;
  return posts.filter((p) => {
    const cats = Array.isArray(p.categories) ? p.categories : [];
    const byId = cartoonId && cats.includes(cartoonId);

    // Also check embedded terms for slug 'cartoon'
    let bySlug = false;
    const terms = p?._embedded?.["wp:term"];
    if (terms && Array.isArray(terms)) {
      for (const arr of terms) {
        if (Array.isArray(arr)) {
          for (const term of arr) {
            if (term?.taxonomy === "category" && term?.slug === "cartoon") {
              bySlug = true;
              break;
            }
          }
        }
        if (bySlug) break;
      }
    }
    return !(byId || bySlug);
  });
}

// ---------- Fetch + page assembly ----------
async function loadPage(page, signal) {
  // Try cache for page 1 to speed up first paint
  if (page === 1 && st.grid && !st.grid.children.length) {
    const cached = loadPageHTMLFromCache(1);
    if (cached) {
      st.grid.innerHTML = cached;
      st.hydratedFromCache = true;
      seedIdsFromDOM();               // <-- prime duplicate filter from cache DOM
    }
  }

  const cartoonId = await getCartoonCategoryId(signal).catch(() => 0);
  const posts = await fetchLeanPostsPage(page, signal);
  const clean = filterOutCartoons(posts, cartoonId);

  // Append only *new* posts; skips ones already in the cache DOM
  renderGridFromPosts(clean);

  if (page === 1 && st.grid && !st.hydratedFromCache) {
    // If we didn't hydrate from cache (cold start), save fresh HTML now
    savePageHTMLToCache(1, st.grid.innerHTML);
  } else if (page === 1 && st.grid && st.hydratedFromCache) {
    // If we hydrated, refresh the cache with the merged, deduped HTML
    savePageHTMLToCache(1, st.grid.innerHTML);
  }

  // Heuristic: hasMore if we got a full page (PER_PAGE=6)
  return { hasMore: Array.isArray(posts) && posts.length === 6 };
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
      } catch {
        // noop; user can scroll again to retry
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
  const app = document.getElementById("app");
  if (!app) return;

  // Build shell (preserve nodes across navigations for scroll restore)
  if (!st.container) {
    st.container = h("div", { class: "container" });
    st.grid = h("div", { class: "grid" });
    st.container.appendChild(st.grid);
  }
  app.innerHTML = "";
  app.appendChild(st.container);

  // Returning from detail → restore scroll
  restoreScrollPosition();

  // Bootstrap first page once
  if (!st.grid.children.length) {
    st.loading = true;
    try {
      st.page = 1;
      st.ended = false;
      st.ids.clear();                // new navigation → clear ID set
      st.hydratedFromCache = false;

      const ctrl = new AbortController();
      const { hasMore } = await loadPage(1, ctrl.signal);
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
    // If grid already exists (back from detail), re-seed IDs from DOM before observing
    seedIdsFromDOM();
    ensureSentinel();
    setupObserver();
  }

  // Persist scroll position when leaving
  const save = () => saveScrollPosition();
  window.removeEventListener("beforeunload", save);
  window.removeEventListener("hashchange", save);
  window.addEventListener("beforeunload", save, { once: true });
  window.addEventListener("hashchange", save, { once: true });
}
