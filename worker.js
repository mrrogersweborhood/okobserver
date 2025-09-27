// worker.js — OkObserver WP proxy @ Cloudflare Workers
// - Proxies a safe subset of WP REST endpoints from okobserver.org
// - Adds CORS: * so your front-end can call same-origin /api/... without errors
// - Caches at Cloudflare edge for 60s with SWR 120s (fast first load)
// - Strips client cache headers to avoid WP preflight/CORS weirdness

const UPSTREAM_ORIGIN = "https://okobserver.org";
const WP_PREFIX = "/wp-json/wp/v2";

// Only allow endpoints your app uses
const ALLOW = new Set([
  "/posts",
  "/media",
  "/categories",
  "/pages",
  "/users",
]);

function isAllowedPath(pathname) {
  // Expect incoming path like: /api/wp/v2/<endpoint>
  const parts = pathname.split("/").filter(Boolean); // ["api","wp","v2","posts"]
  if (parts.length < 4) return false;
  if (parts[0] !== "api" || parts[1] !== "wp" || parts[2] !== "v2") return false;
  const endpoint = `/${parts[3]}`; // "/posts"
  return ALLOW.has(endpoint);
}

function buildUpstreamURL(reqUrl) {
  const url = new URL(reqUrl);
  // Convert /api/wp/v2/... -> /wp-json/wp/v2/...
  const upstream = new URL(UPSTREAM_ORIGIN);
  upstream.pathname = `${WP_PREFIX}${url.pathname.replace(/^\/api\/wp\/v2/, "")}`;
  upstream.search = url.search; // keep query string
  return upstream.toString();
}

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

async function handleOptions() {
  // Preflight or bare OPTIONS
  return new Response(null, { status: 204, headers: corsHeaders("*") });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Only proxy /api/wp/v2/*
    if (!url.pathname.startsWith("/api/wp/v2/") || !isAllowedPath(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    const upstreamUrl = buildUpstreamURL(url.toString());

    // Use edge cache for 60s; allow stale-while-revalidate 120s
    const fetchInit = {
      method: "GET",
      // IMPORTANT: avoid sending client cache headers that can trigger preflights
      headers: { "Accept": "application/json" },
      redirect: "follow",
      cf: {
        cacheTtl: 60,
        cacheEverything: true,
      },
    };

    let res;
    try {
      res = await fetch(upstreamUrl, fetchInit);
    } catch (e) {
      return new Response(`Upstream fetch failed: ${e?.message || e}`, {
        status: 502,
        headers: { ...corsHeaders("*"), "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Clone headers and add our CORS + cache headers
    const h = new Headers(res.headers);
    // Sanitize hop-by-hop headers
    h.delete("Set-Cookie");
    // Stronger caching hint (cf cache above still applies)
    h.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");

    // CORS
    const withCors = corsHeaders("*");
    for (const [k, v] of Object.entries(withCors)) h.set(k, v);

    return new Response(res.body, { status: res.status, headers: h });
  },
};
