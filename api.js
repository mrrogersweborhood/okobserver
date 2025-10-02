// api.js — resilient API helpers for OkObserver
// - Robust base URL discovery
// - Cartoon category exclusion (optional)
// - Lean posts paging (with featured_media id)
// - Batch media fetch by IDs
// - Batch posts content fetch to extract first <img> when no featured image exists

/* =========================
   Base / URL helpers
   ========================= */

function apiBase() {
  let base = (typeof window !== "undefined" && window.OKO_API_BASE) || `${location.origin}/api/wp/v2`;
  base = String(base).trim();
  if (!base) base = `${location.origin}/api/wp/v2`;
  if (!/\/$/.test(base)) base += "/";
  return base;
}

function cleanEndpoint(endpoint) {
  return String(endpoint || "").replace(/^\/+/, "");
}

export function buildUrl(endpoint, params) {
  const base = apiBase();
  const ep = cleanEndpoint(endpoint);
  const url = new URL(ep, base);
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function safeFetch(url, opt = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opt.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API Error ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
    }
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

/* =========================
   Cartoon category lookup (optional)
   ========================= */

const SS_KEY_CARTOON_ID = "__oko_cartoon_cat_id_v1";

export async function ensureCartoonCategoryId() {
  try {
    const cached = sessionStorage.getItem(SS_KEY_CARTOON_ID);
    if (cached) return cached === "null" ? null : Number(cached);

    const url = buildUrl("categories", {
      search: "cartoon",
      per_page: 100,
      _fields: "id,slug,name",
    });
    const cats = await safeFetch(url);
    const match = Array.isArray(cats)
      ? cats.find(c => (c?.slug || "").toLowerCase() === "cartoon")
      : null;

    const id = match?.id ?? null;
    sessionStorage.setItem(SS_KEY_CARTOON_ID, id == null ? "null" : String(id));
    return id;
  } catch {
    return null;
  }
}

/* =========================
   Mapping helpers
   ========================= */

function pickThumb(media) {
  try {
    const sizes = media?.media_details?.sizes || {};
    const order = ["medium_large", "large", "medium", "full"];
    for (const key of order) {
      const s = sizes[key];
      if (s?.source_url) return s.source_url;
    }
    return media?.source_url || "";
  } catch {
    return "";
  }
}

function authorFromEmbedded(p) {
  return (
    p?._embedded?.author?.[0]?.name ||
    (Array.isArray(p?.authors) && p.authors[0]?.name) ||
    ""
  );
}

function decodeEntities(html) {
  if (!html) return "";
  return String(html)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&hellip;|&#8230;/g, "…")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/<[^>]*>/g, "")
    .trim();
}

/* =========================
   Public API
   ========================= */

export async function fetchPost(id) {
  const url = buildUrl(`posts/${id}`, { _embed: 1 });
  return safeFetch(url);
}

/**
 * Fetch a lean page of posts. Returns:
 *   { posts: [{ id, dateISO, dateText, title, excerpt, author, thumb, featuredId }], hasMore }
 */
export async function fetchLeanPostsPage(page = 1, perPage = 6) {
  const cartoonId = await ensureCartoonCategoryId();

  const params = {
    status: "publish",
    per_page: perPage,
    page,
    _embed: 1,
    orderby: "date",
    order: "desc",
    _fields: [
      "id",
      "date",
      "title.rendered",
      "excerpt.rendered",
      "author",
      "featured_media",
      "categories",
      "_embedded.author.name",
      "_embedded.wp:featuredmedia.source_url",
      "_embedded.wp:featuredmedia.media_details.sizes",
      "_embedded.wp:term",
    ].join(","),
    __fresh: (Math.random() * 1000).toFixed(3),
  };

  if (cartoonId) {
    params["categories_exclude"] = String(cartoonId);
  }

  const url = buildUrl("posts", params);
  const data = await safeFetch(url);

  const posts = (Array.isArray(data) ? data : []).map(p => {
    const media = p?._embedded?.["wp:featuredmedia"]?.[0];
    return {
      id: p.id,
      dateISO: p.date,
      dateText: new Date(p.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
      title: decodeEntities(p?.title?.rendered || ""),
      excerpt: decodeEntities(p?.excerpt?.rendered || ""),
      author: authorFromEmbedded(p),
      thumb: pickThumb(media),
      featuredId: p?.featured_media || null,
    };
  });

  const hasMore = posts.length >= perPage;
  return { posts, hasMore };
}

/**
 * Batch fetch media by IDs (used to backfill thumbs when _embed is missing).
 * Returns a map: { [id]: { src, alt } }
 */
export async function fetchMediaBatch(ids = []) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return {};
  const url = buildUrl("media", {
    include: uniq.join(","),
    per_page: 100,
    _fields: "id,source_url,media_details.sizes,alt_text",
  });
  const arr = await safeFetch(url);
  const out = {};
  for (const m of arr || []) {
    const sizes = m?.media_details?.sizes || {};
    const pick =
      sizes?.medium_large?.source_url ||
      sizes?.large?.source_url ||
      sizes?.medium?.source_url ||
      m?.source_url ||
      "";
    out[m.id] = { src: pick || "", alt: m?.alt_text || "" };
  }
  return out;
}

/**
 * Batch fetch posts by IDs to extract the first <img> from content as a fallback preview.
 * Returns: { [postId]: { src, alt } }
 */
export async function fetchPostsContentFirstImage(ids = []) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};

  const url = buildUrl("posts", {
    include: uniq.join(","),
    per_page: uniq.length,
    _fields: "id,content.rendered",
  });
  const arr = await safeFetch(url);
  const out = {};
  for (const p of arr || []) {
    const html = p?.content?.rendered || "";
    const m = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (m && m[1]) {
      out[p.id] = { src: m[1], alt: "" };
    }
  }
  return out;
}
