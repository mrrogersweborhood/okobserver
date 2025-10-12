// worker.js — OkObserver CORS proxy for WordPress REST API
// Supports BOTH /wp-json/wp/v2/* and /wp/v2/*
// Adds CORS and preserves WP pagination headers.

const ORIGIN = "https://okobserver.org"; // your WordPress site

function cors(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function upstreamUrl(reqUrl) {
  const url = new URL(reqUrl);
  const isCanonical = url.pathname.startsWith("/wp-json/wp/v2/");
  const isShort = url.pathname.startsWith("/wp/v2/");
  if (!isCanonical && !isShort) return null;

  const target = new URL(ORIGIN);
  target.pathname = isCanonical ? url.pathname : "/wp-json" + url.pathname; // /wp/v2 -> /wp-json/wp/v2
  target.search = url.search;
  return target.toString();
}

async function proxyGET(request, targetURL) {
  const resp = await fetch(targetURL, {
    headers: { "user-agent": request.headers.get("user-agent") || "" },
    cf: { cacheEverything: false },
  });

  const out = new Response(resp.body, resp);
  // CORS
  const c = cors(request);
  for (const k in c) out.headers.set(k, c[k]);
  // WP pagination headers
  ["X-WP-Total", "X-WP-TotalPages", "Link"].forEach(h => {
    const v = resp.headers.get(h);
    if (v) out.headers.set(h, v);
  });
  return out;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request) });
    }

    // Health
    if (url.pathname === "/__health") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json", ...cors(request) },
      });
    }

    // Proxy routes
    const target = upstreamUrl(request.url);
    if (target && request.method === "GET") {
      return proxyGET(request, target);
    }

    return new Response("Not Found", { status: 404, headers: cors(request) });
  },
};
