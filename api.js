// api.js — resilient API helpers for OkObserver
// - Robust base URL discovery (prevents "Invalid URL")
// - Cartoon category exclusion (optional)
// - Lean posts paging
// - Single-post fetch with _embed

/* =========================
   Base / URL helpers
   ========================= */

function apiBase() {
  // Prefer explicit global set by main/index, else default to /api/wp/v2 under current origin
  let base = (typeof window !== "undefined" && window.OKO_API_BASE) || `${location.origin}/api/wp/v2`;
  // Normalize: ensure single trailing slash
  base = String(base).trim();
  if (!base) base = `${location.origin}/api/wp/v2`;
  if (!/\/$/.test(base)) base += "/";
  return base;
}

function cleanEndpoint(endpoint) {
  // Remove any leading slash so URL(base, endpoint) doesn’t drop path
  return String(endpoint || "").replace(/^\/+/, "");
}

function buildUrl(endpoint, params) {
  const base = apiBase();                     // always absolute, always ends with /
  const ep = cleanEndpoint(endpoint);         // no leading slash
  const url = new URL(ep, base);              // safe construction
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

    // Use categories?search=cartoon and scan for slug === 'cartoon'
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
    // If it fails (CORS, network), don’t break the app—just return null so we skip exclusion server-side.
    return null;
  }
}

/* =========================
   Mapping helpers
   ========================= */

function pickThumb(media) {
  // Choose best available size
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
  // tiny decoder for curly quotes and ellipsis, etc.
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
    .replace(/<[^>]*>/g, "") // strip tags for excerpt text
    .trim();
}

/* =========================
   Public API
   ========================= */

export async function fetchPost(id) {
  const url = buildUrl(`posts/${id}`, {
    _embed: 1,
  });
  return safeFetch(url);
}

export async function fetchLeanPostsPage(page = 1, perPage = 6) {
  // Optional cartoon exclusion (if we can resolve the category id)
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
  };

  if (cartoonId) {
    params["categories_exclude"] = String(cartoonId);
  }

  // Small jitter param to avoid overly sticky caches (proxy can ignore it if desired)
  params["__fresh"] = (Math.random() * 1000).toFixed(3);

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
    };
  });

  // Heuristic: if fewer than requested, probably end of list
  const hasMore = posts.length >= perPage;

  return { posts, hasMore };
}
