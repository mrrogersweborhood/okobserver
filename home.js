// home.js — renders the post summary grid, snapshot/restore, infinite scroll,
// and now: robust thumbnail handling with a media backfill if _embed is missing.

import { fetchLeanPostsPage, fetchMediaBatch, buildUrl } from "./api.js";
import { SS, HOME_SNAPSHOT_KEY, HOME_SNAPSHOT_TTL_MS, now, debounce } from "./shared.js";

// ===== Public API (used by router/main) =====
export function saveHomeSnapshot() {
  const app = document.getElementById("app");
  if (!app) return;
  const grid = app.querySelector(".grid");
  if (!grid) return;

  const payload = {
    html: grid.outerHTML,
    scrollY: document.scrollingElement?.scrollTop || window.pageYOffset || 0,
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

  app.innerHTML = `
    <div class="container">
      <div class="grid-restored">${data.html}</div>
      <div id="sentinel" aria-hidden="true" style="height:1px"></div>
    </div>
  `;
  const inner = app.querySelector(".grid") || app.querySelector(".grid-restored .grid");
  if (!inner) return false;

  bindHomeInteractions(app, { restored: true });

  requestAnimationFrame(() => {
    window.scrollTo(0, data.scrollY || 0);
  });

  return true;
}

// ===== Normal Home render (network path) =====
export async function renderHome() {
  const app = document.getElementById("app");
  if (!app) return;

  if (tryRestoreHome()) return;

  app.innerHTML = `<div class="container"><p class="center">Loading…</p></div>`;

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

  // Backfill missing thumbnails if needed (e.g., when _embed is stripped by proxy)
  await backfillThumbsIntoGrid(app, posts);

  bindHomeInteractions(app, { page, hasMore });
}

// ===== Card markup =====
function renderCard(p) {
  const href = `#/post/${p.id}`;
  const img = p.thumb
    ? `<img class="thumb" src="${p.thumb}" alt="" loading="lazy" decoding="async" />`
    : `<div class="thumb" aria-hidden="true" style="background:#f0f0f0;height:160px"></div>`;
  const author = p.author || "";
  const date = p.dateText || "";

  return `
    <article class="card" data-id="${p.id}" data-featured-id="${p.featuredId || ""}">
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
function bindHomeInteractions(app, state = { page: 1, hasMore: true, restored: false }) {
  app.addEventListener("click", onCardClickOnce, { once: true, capture: true });
  setupInfiniteScroll(app, state);
}

function onCardClickOnce(e) {
  const a = e.target.closest('a[href^="#/post/"]');
  if (!a) return;
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
        const html = posts.map(renderCard).join("");
        grid.insertAdjacentHTML("beforeend", html);
        // Backfill for the newly appended cards if needed
        await backfillThumbsIntoGrid(app, posts);
        page = next;
        hasMore = !!more;
      } else {
        hasMore = false;
      }
    } catch {
      // allow retry
    } finally {
      loading = false;
    }
  }, 80);

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) loadMore();
    });
  }, { rootMargin: "800px 0px 800px 0px" });

  io.observe(sentinel);
}

/* =========================
   Thumbnail backfill
   ========================= */
/**
 * If some posts have no p.thumb but do have featuredId, request a batch
 *   GET /media?include=...&_fields=id,source_url,media_details.sizes,alt_text
 * and patch the DOM thumbnails in place.
 */
async function backfillThumbsIntoGrid(app, posts) {
  const needs = posts.filter(p => !p.thumb && p.featuredId);
  if (!needs.length) return;

  const idSet = [...new Set(needs.map(p => p.featuredId).filter(Boolean))];
  if (!idSet.length) return;

  let mediaMap = {};
  try {
    mediaMap = await fetchMediaBatch(idSet);
  } catch {
    return; // silent; we keep placeholders
  }

  // Patch DOM
  needs.forEach(p => {
    const media = mediaMap[p.featuredId];
    if (!media?.src) return;
    const card = app.querySelector(`.card[data-id="${p.id}"]`);
    if (!card) return;
    const link = card.querySelector(".thumb-link");
    if (!link) return;

    // Replace placeholder with real image
    const existingImg = link.querySelector("img.thumb");
    if (existingImg) {
      // had img but empty src? make sure it points to real
      existingImg.src = media.src;
      if (!existingImg.alt) existingImg.alt = media.alt || "";
    } else {
      // had placeholder div — inject an <img>
      link.innerHTML = `<img class="thumb" src="${media.src}" alt="${media.alt || ""}" loading="lazy" decoding="async" />`;
    }
  });
}
