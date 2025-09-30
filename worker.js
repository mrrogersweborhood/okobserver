// worker.js — OkObserver WP proxy @ Cloudflare Workers (workers.dev edition)
// - Proxies a SAFE subset of WP REST endpoints from okobserver.org
// - Adds CORS: *  (so your GitHub Pages app can fetch without errors)
// - Caches at the Cloudflare edge for 60s with SWR 120s (snappier loads)

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
  // Expect incoming path like: /wp/v2/<endpoint>
  const parts = pathname.split("/").filter(Boolean); // ["wp","v2","posts"]
  if (parts.length < 3) return false;
  if (parts[0] !== "wp" || parts[1] !== "v2") return false;
  const endpoint = `/${parts[2]}`; // "/posts"
  return ALLOW.has(endpoint);
}

function buildUpstreamURL(reqUrl) {
  const url = new URL(reqUrl);
  // Convert /wp/v2/... -> /wp-json/wp/v2/...
  const upstream = new URL(UPSTREAM_ORIGIN);
  upstream.pathname = `${WP_PREFIX}${url.pathname.replace(/^\/wp\/v2/, "")}`;
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

    // Allow only /wp/v2/* on workers.dev
    if (!url.pathname.startsWith("/wp/v2/") || !isAllowedPath(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    const upstreamUrl = buildUpstreamURL(url.toString());

    // Edge cache for 60s; SWR for 120s
    const fetchInit = {
      method: "GET",
      headers: { "Accept": "application/json" }, // avoid client cache headers → fewer preflights
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

    const h = new Headers(res.headers);
    h.delete("Set-Cookie");
    h.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");

    const withCors = corsHeaders("*");
    for (const [k, v] of Object.entries(withCors)) h.set(k, v);

    return new Response(res.body, { status: res.status, headers: h });
  },
};
