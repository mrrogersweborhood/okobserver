// home.js — renders the post summary grid, snapshot/restore, infinite scroll,
// and robust thumbnail handling:
//  1) use _embed-provided featured image if present
//  2) backfill by featured_media id (media batch)
//  3) if still missing, batch-fetch post content and use first <img> as preview
//  4) if STILL missing, use site logo as a placeholder thumbnail

import {
  fetchLeanPostsPage,
  fetchMediaBatch,
  fetchPostsContentFirstImage
} from "./api.js";
import { SS, HOME_SNAPSHOT_KEY, HOME_SNAPSHOT_TTL_MS, now, debounce } from "./shared.js";

// Site logo placeholder (same as header)
const PLACEHOLDER_LOGO =
  "https://okobserver.org/wp-content/uploads/2015/09/Observer-Logo-2015-08-05.png";

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

  // Backfills:
  await ensureThumbnails(app, posts);

  bindHomeInteractions(app, { page, hasMore });
}

// ===== Card markup =====
function renderCard(p) {
  const href = `#/post/${p.id}`;
  const imgSrc = p.thumb || PLACEHOLDER_LOGO; // immediate placeholder if missing
  const img = `<img class="thumb" src="${imgSrc}" alt="" loading="lazy" decoding="async" />`;
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
        // Backfills for appended posts
        await ensureThumbnails(app, posts);
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
   Thumbnail backfills (2 stages) + final placeholder
   ========================= */
async function ensureThumbnails(app, posts) {
  // 1) media-ID backfill for cards where featured_media exists but _embed didn’t include it
  const needById = posts.filter(p => !p.thumb && p.featuredId);
  if (needById.length) {
    const idSet = [...new Set(needById.map(p => p.featuredId).filter(Boolean))];
    if (idSet.length) {
      try {
        const mediaMap = await fetchMediaBatch(idSet);
        patchThumbsFromMap(app, posts, mediaMap, /*prop*/"featuredId");
      } catch { /* silent */ }
    }
  }

  // 2) content-first-image backfill for anything still without a thumbnail
  const stillMissing = posts.filter(p => {
    const card = app.querySelector(`.card[data-id="${p.id}"]`);
    if (!card) return false;
    const img = card.querySelector("img.thumb");
    return !img || !img.getAttribute("src") || isPlaceholder(img.getAttribute("src"));
  });

  if (stillMissing.length) {
    const ids = stillMissing.map(p => p.id);
    try {
      const contentMap = await fetchPostsContentFirstImage(ids);
      patchThumbsFromMap(app, stillMissing, contentMap, /*prop*/"id");
    } catch { /* silent */ }
  }

  // 3) FINAL GUARANTEE: logo placeholder for any remaining missing thumbs
  applyLogoPlaceholderIfMissing(app, posts);
}

function patchThumbsFromMap(app, postsSubset, map, keyProp) {
  postsSubset.forEach(p => {
    const key = p[keyProp];
    const media = map[key];
    if (!media?.src) return;
    const card = app.querySelector(`.card[data-id="${p.id}"]`);
    if (!card) return;
    const link = card.querySelector(".thumb-link");
    if (!link) return;

    const existingImg = link.querySelector("img.thumb");
    if (existingImg) {
      existingImg.src = media.src;
      if (!existingImg.alt) existingImg.alt = media.alt || "";
    } else {
      link.innerHTML = `<img class="thumb" src="${media.src}" alt="${media.alt || ""}" loading="lazy" decoding="async" />`;
    }
  });
}

function applyLogoPlaceholderIfMissing(app, posts) {
  posts.forEach(p => {
    const card = app.querySelector(`.card[data-id="${p.id}"]`);
    if (!card) return;
    const link = card.querySelector(".thumb-link");
    if (!link) return;
    let img = link.querySelector("img.thumb");
    if (!img) {
      // If somehow we still have a div placeholder, replace it
      link.innerHTML = `<img class="thumb" src="${PLACEHOLDER_LOGO}" alt="The Oklahoma Observer" loading="lazy" decoding="async" />`;
      return;
    }
    const src = img.getAttribute("src") || "";
    if (!src || isPlaceholder(src)) {
      img.setAttribute("src", PLACEHOLDER_LOGO);
      if (!img.getAttribute("alt")) img.setAttribute("alt", "The Oklahoma Observer");
    }
  });
}

function isPlaceholder(src) {
  // treat empty, data URIs, or just whitespace as missing
  return !src || /^data:|^\s*$/.test(src);
}
