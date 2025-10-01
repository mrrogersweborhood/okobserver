// api.js — WordPress API helpers via Cloudflare Worker
// Exposes: fetchLeanPostsPage(page, signal), fetchPost(id)

const BASE = (() => {
  const b = (typeof window !== "undefined" && window.OKO_API_BASE) || "";
  if (!b) console.warn("[OkObserver] OKO_API_BASE not set; API calls will fail.");
  return b.replace(/\/+$/, "");
})();

const CARTOON_CACHE_KEY = "__oko_cartoon_cat_v1";

// ---------- small utils ----------
const uniq = (arr) => Array.from(new Set(arr.filter((x) => x || x === 0)));
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ---------- cartoon category lookup/cache ----------
function getCachedCartoonId() {
  try {
    const raw = sessionStorage.getItem(CARTOON_CACHE_KEY);
    if (!raw) return null;
    const { id, ts } = JSON.parse(raw);
    if (!ts || Date.now() - ts < 12 * 60 * 60 * 1000) return typeof id === "number" ? id : null;
  } catch {}
  return null;
}
function setCachedCartoonId(id) {
  try {
    sessionStorage.setItem(CARTOON_CACHE_KEY, JSON.stringify({ id, ts: Date.now() }));
  } catch {}
}
async function ensureCartoonCategoryId(signal) {
  const cached = getCachedCartoonId();
  if (cached !== null) return cached;
  const u = new URL(`${BASE}/categories`);
  u.searchParams.set("slug", "cartoon");
  // keep it simple: avoid _fields so some WP stacks don’t strip useful bits
  u.searchParams.set("per_page", "10");
  let id = null;
  try {
    const res = await fetch(u.toString(), { signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Category lookup ${res.status}`);
    const data = await res.json();
    const hit = Array.isArray(data) ? data.find((c) => c?.slug === "cartoon") : null;
    id = hit?.id ?? null;
    setCachedCartoonId(id);
  } catch (e) {
    console.warn("[OkObserver] Could not fetch category 'cartoon'; client filter will be used.", e);
  }
  return id;
}

// ---------- build posts URL ----------
function buildPostsURL(page, cartoonId) {
  const u = new URL(`${BASE}/posts`);
  u.searchParams.set("status", "publish");
  u.searchParams.set("per_page", "6");
  u.searchParams.set("page", String(page));
  u.searchParams.set("_embed", "1");
  u.searchParams.set("orderby", "date");
  u.searchParams.set("order", "desc");
  if (typeof cartoonId === "number") u.searchParams.set("categories_exclude", String(cartoonId));
  // small cache buster for page-1 freshness
  u.searchParams.set("__fresh", (Math.random() * 1000).toFixed(3));
  return u.toString();
}

// ---------- client fallback filter: remove 'cartoon' ----------
function filterOutCartoonsClient(posts) {
  return posts.filter((p) => {
    try {
      const termGroups = p?._embedded?.["wp:term"];
      if (!Array.isArray(termGroups)) return true;
      for (const group of termGroups) {
        if (!Array.isArray(group)) continue;
        if (group.some((t) => (t?.slug || "").toLowerCase() === "cartoon")) return false;
      }
      return true;
    } catch {
      return true;
    }
  });
}

// ---------- enrichment: fill missing author names + featured images ----------
async function enrichAuthors(posts, signal) {
  // If authors already embedded, skip
  const needs = posts.filter((p) => !p?._embedded?.author?.[0]?.name && typeof p?.author === "number");
  if (!needs.length) return;

  const ids = uniq(needs.map((p) => p.author)).filter((n) => n > 0);
  if (!ids.length) return;

  // WP supports up to 100 per page; include param length can get long, so chunk
  const idChunks = chunk(ids, 30);
  const map = new Map();

  for (const slice of idChunks) {
    const u = new URL(`${BASE}/users`);
    u.searchParams.set("include", slice.join(","));
    // Avoid _fields to keep behavior consistent across WP stacks
    const res = await fetch(u.toString(), { signal, headers: { Accept: "application/json" } });
    if (!res.ok) continue;
    const arr = await res.json();
    if (Array.isArray(arr)) {
      for (const user of arr) {
        if (user && typeof user.id === "number") {
          map.set(user.id, user.name || user.slug || `Author ${user.id}`);
        }
      }
    }
  }

  for (const p of needs) {
    const name = map.get(p.author);
    if (name) {
      p._embedded = p._embedded || {};
      p._embedded.author = [{ id: p.author, name }];
    }
  }
}

function pickBestMediaUrl(media) {
  try {
    const sizes = media?.media_details?.sizes || {};
    const order = ["large", "medium_large", "medium", "thumbnail", "1536x1536", "2048x2048", "full"];
    const best = order.map((k) => sizes[k]).find((s) => s?.source_url) || null;
    return (best?.source_url || media?.source_url || "").trim();
  } catch {
    return "";
  }
}

async function enrichMedia(posts, signal) {
  // If featured media already embedded, skip
  const needs = posts.filter(
    (p) => !p?._embedded?.["wp:featuredmedia"]?.[0]?.source_url && typeof p?.featured_media === "number" && p.featured_media > 0
  );
  if (!needs.length) return;

  const ids = uniq(needs.map((p) => p.featured_media)).filter((n) => n > 0);
  if (!ids.length) return;

  const idChunks = chunk(ids, 30);
  const map = new Map();

  for (const slice of idChunks) {
    const u = new URL(`${BASE}/media`);
    u.searchParams.set("include", slice.join(","));
    const res = await fetch(u.toString(), { signal, headers: { Accept: "application/json" } });
    if (!res.ok) continue;
    const arr = await res.json();
    if (Array.isArray(arr)) {
      for (const m of arr) {
        if (m && typeof m.id === "number") {
          map.set(m.id, {
            source_url: pickBestMediaUrl(m),
            media_details: m.media_details || null,
          });
        }
      }
    }
  }

  for (const p of needs) {
    const m = map.get(p.featured_media);
    if (m && m.source_url) {
      p._embedded = p._embedded || {};
      p._embedded["wp:featuredmedia"] = [
        {
          id: p.featured_media,
          source_url: m.source_url,
          media_details: m.media_details || undefined,
        },
      ];
    }
  }
}

async function enrichPosts(posts, signal) {
  // Run both enrichers; failures are non-fatal
  try { await enrichAuthors(posts, signal); } catch (e) { console.warn("[OkObserver] author enrich failed", e); }
  try { await enrichMedia(posts, signal); } catch (e) { console.warn("[OkObserver] media enrich failed", e); }
  return posts;
}

// ---------- public API ----------
export async function fetchLeanPostsPage(page = 1, signal) {
  const cartoonId = await ensureCartoonCategoryId(signal);
  const url = buildPostsURL(page, cartoonId);

  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API Error ${res.status}`);

  const totalPages = Number(res.headers.get("X-WP-TotalPages") || 1);
  let posts = await res.json();
  if (!Array.isArray(posts)) posts = [];

  // Safety: even if server-side exclude applied, still run client filter
  posts = filterOutCartoonsClient(posts);

  // 🔧 Enrich missing author names / featured images
  posts = await enrichPosts(posts, signal);

  return { posts, totalPages, fromCache: false };
}

export async function fetchPost(id, signal) {
  const u = new URL(`${BASE}/posts/${id}`);
  u.searchParams.set("_embed", "1");
  // keep full embed for detail too
  const res = await fetch(u.toString(), { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  return res.json();
}
