// home.js — renders the post summary grid and provides restore/save snapshot hooks

import { fetchLeanPostsPage } from "./api.js";
import { SS, HOME_SNAPSHOT_KEY, HOME_SNAPSHOT_TTL_MS, now, debounce } from "./shared.js";

// ===== Public API (used by router/main) =====
export function saveHomeSnapshot() {
  const app = document.getElementById("app");
  if (!app) return;

  // Only snapshot the grid container to keep it small
  const grid = app.querySelector(".grid");
  if (!grid) return;

  const payload = {
    html: grid.outerHTML,
    // Remember minimal UI around it (header/Footer are static in index.html)
    // We also remember scroll so "cursor" stays put.
    scrollY: document.scrollingElement?.scrollTop || window.pageYOffset || 0,
    // A tiny signature so we can tell if layout changed in future
    meta: { v: 3, when: now() }
  };

  SS.set(HOME_SNAPSHOT_KEY, JSON.stringify(payload));
}

export function tryRestoreHome() {
  const raw = SS.get(HOME_SNAPSHOT_KEY);
  if (!raw) return false;

  let data;
  try { data = JSON.parse(raw); } catch { return false; }

  if (!data?.html || !data?.meta?.when) return false;
  if (now() - data.meta.when > HOME_SNAPSHOT_TTL_MS) {
    SS.del(HOME_SNAPSHOT_KEY);
    return false;
  }

  const app = document.getElementById("app");
  if (!app) return false;

  // Rehydrate the grid into the app shell
  app.innerHTML = `
    <div class="container">
      <div class="grid-restored">${data.html}</div>
    </div>
  `;
  // The stored html already includes .grid wrapper; ensure we didn’t nest weirdly
  const inner = app.querySelector(".grid") || app.querySelector(".grid-restored .grid");
  if (!inner) return false;

  // Re-bind behaviors the same way initial render would
  bindHomeInteractions(app);

  // Restore scroll after next frame so layout is ready
  requestAnimationFrame(() => {
    window.scrollTo(0, data.scrollY || 0);
  });

  return true;
}

// ===== Normal Home render (network path) =====
export async function renderHome() {
  const app = document.getElementById("app");
  if (!app) return;

  // If we can restore, do it and exit quickly.
  if (tryRestoreHome()) return;

  app.innerHTML = `<div class="container"><p class="center">Loading…</p></div>`;

  // Initial page fetch (your existing paging still applies)
  // Keep page size small for first paint; infinite scroll will add more.
  const page = 1;
  const { posts, hasMore } = await fetchLeanPostsPage(page);

  app.innerHTML = `
    <div class="container">
      <div class="grid">
        ${posts.map(renderCard).join("")}
      </div>
      <div id="sentinel" aria-hidden="true" style="height:1px"></div>
    </div>
  `;

  bindHomeInteractions(app, { page, hasMore });
}

// ===== Card markup =====
function renderCard(p) {
  const href = `#/post/${p.id}`;
  const img = p.thumb ? `<img class="thumb" src="${p.thumb}" alt="" loading="lazy" decoding="async" />` : `<div class="thumb" aria-hidden="true"></div>`;
  const author = p.author || "";
  const date = p.dateText || "";

  return `
    <article class="card" data-id="${p.id}">
      <a class="thumb-link" href="${href}" aria-label="${p.title}">
        ${img}
      </a>
      <div class="card-body">
        <a class="title" href="${href}">${p.title}</a>
        <div class="meta-author-date">
          ${author ? `<strong>${author}</strong>` : ``}
          <span class="date">${date}</span>
        </div>
        <div class="excerpt">${p.excerpt || ""}</div>
      </div>
    </article>
  `;
}

// ===== Wire up clicks + infinite scroll =====
function bindHomeInteractions(app, state = { page: 1, hasMore: true }) {
  // Intercept clicks on cards to save snapshot before route change
  app.addEventListener("click", onCardClickOnce, { once: true, capture: true });

  // Infinite scroll (idempotent)
  setupInfiniteScroll(app, state);
}

function onCardClickOnce(e) {
  const a = e.target.closest('a[href^="#/post/"]');
  if (!a) return;
  // Save snapshot right before we navigate away
  saveHomeSnapshot();
}

function setupInfiniteScroll(app, state) {
  const grid = app.querySelector(".grid");
  const sentinel = app.querySelector("#sentinel");
  if (!grid || !sentinel) return;

  let page = state.page || 1;
  let loading = false;
  let hasMore = state.hasMore !== false;

  const loadMore = debounce(async () => {
    if (loading || !hasMore) return;
    loading = true;
    try {
      const next = page + 1;
      const { posts, hasMore: more } = await fetchLeanPostsPage(next);
      if (posts && posts.length) {
        grid.insertAdjacentHTML("beforeend", posts.map(renderCard).join(""));
        page = next;
        hasMore = !!more;
      } else {
        hasMore = false;
      }
    } catch {
      // leave hasMore as-is; allow retries on scroll
    } finally {
      loading = false;
    }
  }, 50);

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) loadMore();
    });
  }, { rootMargin: "800px 0px 800px 0px" });

  io.observe(sentinel);
}
