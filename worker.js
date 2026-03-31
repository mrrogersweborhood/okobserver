// 🟢 worker.js
// OkObserver Cloudflare Worker — FULL REPLACEMENT (v2025-12-13a)
// (Filename is illustrative; paste into your Cloudflare Worker editor as the whole script.)
// 🟢 worker.js

/**
 * OkObserver Cloudflare Worker — FULL REPLACEMENT (v2025-12-13a)
 * - Proxies WordPress REST JSON from https://okobserver.org
 * - Adds /auth/login + /auth/logout for JWT cookie sessions
 * - Injects Authorization: Bearer <jwt> to upstream when cookie present
 * - Never caches authenticated requests
 * - CORS for GitHub Pages (credentials supported for your GH origin)
 * - /status health endpoint
 * - Friendly / root text for Cloudflare preview
 */

const ORIGIN = "https://okobserver.org";
const API_ALLOW = ["/wp-json/", "/content/full-post", "/content/author-posts"]; // allow WP API + full-post helper + author-posts helper


const CACHE_TTL = 300;        // seconds
const NOCACHE_QS = "nocache"; // append ?nocache=1 to bypass edge caching

/* ---------------- AUTH HELPERS ---------------- */

const JWT_COOKIE_NAME = "okobserver_jwt";
const JWT_MAX_AGE = 60 * 60 * 8; // 8 hours
const WP_JWT_ENDPOINT = `${ORIGIN}/wp-json/jwt-auth/v1/token`; // JWT Authentication for WP REST API

async function handleLogin(request) {
  try {
    let body = null;

    try {
      body = await request.json();
    } catch (_) {
      return json(
        400,
        { success: false, message: "Invalid JSON body." },
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0"
        },
        request
      );
    }

    const rawUsername = body && typeof body.username === "string" ? body.username : "";
    const rawPassword = body && typeof body.password === "string" ? body.password : "";

    const username = rawUsername.trim();
    const password = rawPassword;

    if (!username || !password) {
      return json(
        400,
        { success: false, message: "Username and password required." },
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0"
        },
        request
      );
    }

    const wpResp = await fetch(WP_JWT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams({ username, password }).toString()
    });

    const rawText = await wpResp.text();
    let data = null;

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (_) {
      data = null;
    }

    // Plugin returns { token, user_email, user_nicename, user_display_name }
    if (!wpResp.ok || !data?.token) {
      const isUpstreamServerError = wpResp.status >= 500;

      if (!isUpstreamServerError) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      return json(
        isUpstreamServerError ? 502 : 401,
        {
          success: false,
          message: isUpstreamServerError
            ? "Authentication service unavailable."
            : ((data && data.message) ? data.message : "Invalid credentials.")
        },
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0"
        },
        request
      );
    }

    const token = data.token;

    const user = {
      id: data?.data?.user?.id || null, // sometimes present, sometimes not
      name: data.user_display_name || data.user_nicename || username,
      email: data.user_email || null
    };

    const headers = new Headers(corsHeaders(request));
    headers.append("Set-Cookie", makeJwtCookie(token, JWT_MAX_AGE));
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    headers.set("pragma", "no-cache");
    headers.set("expires", "0");

    return new Response(JSON.stringify({ success: true, user }), {
      status: 200,
      headers
    });
  } catch (err) {
    console.error("[Auth] Login failed:", err?.message || err);
    return json(
      500,
      {
        error: "Login failed",
        detail: String(err?.message || err || ""),
        path: new URL(request.url).pathname
      },
      {
        "cache-control": "no-store",
        "pragma": "no-cache",
        "expires": "0"
      },
      request
    );
  }
}

async function handleLogout(request) {
  const headers = new Headers(corsHeaders(request));
  headers.append("Set-Cookie", expireJwtCookie());
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers
  });
}
function makeJwtCookie(token, maxAge) {
  return [
    `${JWT_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Partitioned",
    `Max-Age=${maxAge}`
  ].join("; ");
}

function expireJwtCookie() {
  return [
    `${JWT_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Partitioned",
    "Max-Age=0"
  ].join("; ");
}

function getJwtFromCookie(request) {
  const cookie = request.headers.get("Cookie") || "";
  const parts = cookie.split(";").map((c) => c.trim());
  for (const p of parts) {
    if (p.startsWith(`${JWT_COOKIE_NAME}=`)) {
      return decodeURIComponent(p.slice(JWT_COOKIE_NAME.length + 1));
    }
  }
  return null;
}

/* ---------------- MAIN FETCH HANDLER ---------------- */

async function fetchUpstreamWithOptionalAuth(upstream, init, hadAuth) {
  const resp = await fetch(upstream, init);

  // If a bad/expired JWT breaks public reads, retry once without Authorization.
  const method = String(init && init.method ? init.method : "GET").toUpperCase();
  const isSafeRead = method === "GET" || method === "HEAD";

  if (hadAuth && isSafeRead && resp.status === 401) {
    const retryHeaders = new Headers(init.headers);
    retryHeaders.delete("Authorization");
    const retryInit = { ...init, headers: retryHeaders };
    return fetch(upstream, retryInit);
  }

  return resp;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Friendly root for Cloudflare Preview
    if (url.pathname === "/" && request.method === "GET") {
      return text(
        200,
        "OkObserver proxy is running. Try /status or /wp-json/wp/v2/posts?per_page=1",
        request,
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0"
        }
      );
    }

/* ------------------ AUTH ROUTES (must come first) ------------------ */
if (url.pathname === "/auth/login" && request.method === "POST") {
  return handleLogin(request);
}
if (url.pathname === "/auth/logout" && request.method === "POST") {
  return handleLogout(request);
}

/* ------------------ AUTH STATUS (must come before API_ALLOW gate) ------------------ */
if (url.pathname === "/auth/status" && request.method === "GET") {
  const jwt = getJwtFromCookie(request);
  const hasToken = !!(jwt && jwt.trim());

  return json(
    200,
    {
      loggedIn: hasToken,
      hasToken
    },
    {
      "cache-control": "no-store",
      "pragma": "no-cache",
      "expires": "0"
    },
    request
  );
}
/* ------------------ AUTHOR POSTS (must come before API_ALLOW gate) ------------------ */
if (url.pathname === "/content/author-posts" && request.method === "GET") {
  return handleAuthorPosts(request, url, env);
}
/* ------------------ FULL POST (must come before API_ALLOW gate) ------------------ */
if (url.pathname === "/content/full-post" && request.method === "GET") {
  return handleFullPost(request, url, env);
}

/* ---------------------- CORS Preflight ---------------------- */
if (request.method === "OPTIONS") {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}


    

    /* ------------------------- Health Check ------------------------- */
    if (url.pathname === "/status") {
      return json(
        200,
        {
          ok: true,
          now: new Date().toISOString(),
          upstream: ORIGIN,
          note: "Proxy is online; JSON passed through unmodified."
        },
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0"
        },
        request
      );
    }

    /* ---------- Allow only expected WP REST API routes ---------- */
    const allowed = API_ALLOW.some((p) => url.pathname.startsWith(p));
    if (!allowed) {
      return text(
        403,
        "Not allowed",
        request,
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0"
        }
      );
    }

    /* ----------------- Build upstream WordPress URL ----------------- */
    const upstream = new URL(`${ORIGIN}${url.pathname}${url.search}`);

    /* ----------------- Prepare headers for upstream ----------------- */
    const fwdHeaders = new Headers(request.headers);
    ["origin", "referer", "cf-connecting-ip", "x-forwarded-for", "x-forwarded-proto"]
      .forEach((h) => fwdHeaders.delete(h));
    fwdHeaders.delete("cookie"); // do NOT forward client cookies to WP; auth is via Authorization header only

    fwdHeaders.set("user-agent", "okobserver-proxy/1.3 (+workers)");

    /* ----------------------- JWT Injection ----------------------- */
// Prefer explicit Authorization header from the SPA (more reliable than cross-site cookies)
const clientAuth = request.headers.get("Authorization") || "";
let jwt = null;

if (clientAuth.toLowerCase().startsWith("bearer ")) {
  jwt = clientAuth.slice(7).trim();
} else {
  jwt = getJwtFromCookie(request);
}

const hadAuth = !!(jwt && jwt.trim());

if (hadAuth) {
  fwdHeaders.set("Authorization", `Bearer ${jwt.trim()}`);
} else {
  fwdHeaders.delete("Authorization");
}


    /* ---------------------- Cache Logic ---------------------- */
    const cacheable =
      !hadAuth &&
      (request.method === "GET" || request.method === "HEAD") &&
      !upstream.searchParams.has(NOCACHE_QS);

    const init = {
      method: request.method,
      headers: fwdHeaders,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : request.body,
      ...(cacheable && {
        cf: {
          cacheEverything: true,
          cacheTtlByStatus: {
            "200-299": CACHE_TTL,
            "300-399": 60,
            "401": 0,
            "403": 0,
            "404": 0,
            "500-599": 0
          }
        }
      })
    };

    /* -------------------- Fetch WordPress -------------------- */
    let upstreamResp;
    try {
      upstreamResp = await fetchUpstreamWithOptionalAuth(upstream, init, hadAuth);
    } catch (err) {
      console.error("[Proxy] Upstream fetch failed:", err?.message || err);
      return jsonError(502, "Upstream fetch failed", err, request);
    }

    /* ------------------- Prepare Outgoing Headers ------------------- */
    const outHeaders = new Headers(upstreamResp.headers);
    Object.entries(corsHeaders(request)).forEach(([k, v]) => outHeaders.set(k, v));

    outHeaders.set(
      "access-control-allow-headers",
      request.headers.get("access-control-request-headers") ||
        "content-type, authorization, x-requested-with"
    );
    outHeaders.set("access-control-allow-methods", "GET,HEAD,POST,OPTIONS");
    outHeaders.set("access-control-max-age", "86400");

    // Allow embeds / oEmbed
    outHeaders.delete("content-security-policy");
    outHeaders.delete("x-frame-options");

    outHeaders.set("x-proxy-cache", cacheable ? "possible" : "bypass");

// IMPORTANT: never allow authenticated WP responses to be stored anywhere.
// This helps prevent the app Service Worker from caching/rehydrating the wrong JSON.
if (hadAuth) {
  outHeaders.set("cache-control", "no-store");
  outHeaders.set("pragma", "no-cache");
  outHeaders.set("expires", "0");

  // Merge Cookie into existing Vary header safely
  const vary = outHeaders.get("vary") || "";
  const parts = vary.split(",").map(v => v.trim()).filter(Boolean);
  if (!parts.some(v => v.toLowerCase() === "cookie")) {
    parts.push("Cookie");
  }
  outHeaders.set("vary", parts.join(", "));
} else if (upstreamResp.status >= 400) {
  outHeaders.set("cache-control", "no-store");
  outHeaders.set("pragma", "no-cache");
  outHeaders.set("expires", "0");
}
// Stream passthrough (JSON or otherwise)
return new Response(upstreamResp.body, {
  status: upstreamResp.status,
  headers: outHeaders
});

  }
};

/* ---------------- helpers ---------------- */
async function handleAuthorPosts(request, url, env) {
  try {
    const author = (url.searchParams.get("author") || "").trim();
    const perPage = Math.max(1, Math.min(50, parseInt(url.searchParams.get("per_page") || "12", 10) || 12));
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);

    if (!author || !/^\d+$/.test(author)) {
      return json(
        400,
        { ok: false, error: "Missing or invalid author" },
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0"
        },
        request
      );
    }

    const basic = env && env.WP_BASIC_AUTH ? String(env.WP_BASIC_AUTH).trim() : "";
    if (!basic) {
      return json(
        500,
        { ok: false, error: "WP_BASIC_AUTH not configured" },
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0"
        },
        request
      );
    }

    const headers = {
      "Authorization": `Basic ${basic}`,
      "Accept": "application/json"
    };

// 🚀 SPEED OPTIMIZATION
const MAX_SCAN_PAGES = 4; // was 12 (huge slowdown)
const upstreamPerPage = 50;
const targetOffset = (page - 1) * perPage;

let matched = [];
let scannedPages = 0;
let reachedEnd = false;

for (let p = 1; p <= MAX_SCAN_PAGES; p++) {
      const upstream = new URL(`${ORIGIN}/wp-json/wp/v2/posts`);
      upstream.searchParams.set("per_page", String(upstreamPerPage));
      upstream.searchParams.set("page", String(p));
      upstream.searchParams.set("_embed", "author,wp:featuredmedia,wp:term");

            const resp = await fetch(upstream.toString(), {
        method: "GET",
        headers
      });

      const data = await resp.json().catch(() => null);

      if (!resp.ok) {
        return json(
          resp.status,
          {
            ok: false,
            status: resp.status,
            upstream: upstream.pathname + upstream.search,
            error: data || null
          },
          {
            "cache-control": "no-store",
            "pragma": "no-cache",
            "expires": "0"
          },
          request
        );
      }

      if (!Array.isArray(data)) {
        return json(
          502,
          {
            ok: false,
            error: "Invalid upstream posts payload",
            upstream: upstream.pathname + upstream.search
          },
          {
            "cache-control": "no-store",
            "pragma": "no-cache",
            "expires": "0"
          },
          request
        );
      }

      const posts = data;
      scannedPages++;

      if (posts.length < upstreamPerPage) {
        reachedEnd = true;
      }

      for (const post of posts) {
        if (String(post && post.author) === author) {
          matched.push(post);
        }
      }

      if (matched.length >= targetOffset + perPage) {
        break;
      }

      if (reachedEnd) {
        break;
      }
    }

    const paged = matched.slice(targetOffset, targetOffset + perPage);

return json(
  200,
  {
    ok: true,
    posts: paged,
    total_matches_seen: matched.length,
    scanned_pages: scannedPages,
    reached_end: reachedEnd
  },
  {
    "cache-control": "no-store",
    "pragma": "no-cache",
    "expires": "0"
  },
  request
);
  } catch (err) {
    return jsonError(500, "author-posts failed", err, request);
  }
}

async function handleFullPost(request, url, env) {
  const __t0 = Date.now();
  let __tEnv = 0, __tFetch = 0, __tJson = 0;

  try {
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) {
      return json(
        400,
        { ok: false, error: "Missing id" },
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0"
        },
        request
      );
    }

    const __tEnv0 = Date.now();
    const basic = env && env.WP_BASIC_AUTH ? String(env.WP_BASIC_AUTH).trim() : "";
    __tEnv = Date.now() - __tEnv0;

    if (!basic) {
      return json(
        500,
        { ok: false, error: "WP_BASIC_AUTH not configured" },
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0"
        },
        request
      );
    }
    const upstream = new URL(`${ORIGIN}/wp-json/wp/v2/posts/${encodeURIComponent(id)}`);
    upstream.searchParams.set("_embed", "author,wp:featuredmedia,wp:term");


    const __tFetch0 = Date.now();
    const resp = await fetch(upstream.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Accept": "application/json"
      }
    });
    __tFetch = Date.now() - __tFetch0;


       const __tJson0 = Date.now();
    const data = await resp.json().catch(() => null);
    __tJson = Date.now() - __tJson0;


    if (!resp.ok) {
      return json(
        resp.status,
        { ok: false, status: resp.status, upstream: upstream.pathname + upstream.search, error: data || null },
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0",
          "x-oo-env-ms": String(__tEnv),
          "x-oo-origin-ms": String(__tFetch),
          "x-oo-json-ms": String(__tJson),
          "x-oo-total-ms": String(Date.now() - __t0),
          "server-timing": `env;dur=${__tEnv}, origin;dur=${__tFetch}, json;dur=${__tJson}, total;dur=${Date.now() - __t0}`
        },
        request
      );
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return json(
        502,
        {
          ok: false,
          error: "Invalid upstream post payload",
          upstream: upstream.pathname + upstream.search
        },
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0",
          "x-oo-env-ms": String(__tEnv),
          "x-oo-origin-ms": String(__tFetch),
          "x-oo-json-ms": String(__tJson),
          "x-oo-total-ms": String(Date.now() - __t0),
          "server-timing": `env;dur=${__tEnv}, origin;dur=${__tFetch}, json;dur=${__tJson}, total;dur=${Date.now() - __t0}`
        },
        request
      );
    }

    return json(
      200,
      { ok: true, post: data },
      {
        "cache-control": "no-store",
        "pragma": "no-cache",
        "expires": "0",
        "x-oo-env-ms": String(__tEnv),
        "x-oo-origin-ms": String(__tFetch),
        "x-oo-json-ms": String(__tJson),
        "x-oo-total-ms": String(Date.now() - __t0),
        "server-timing": `env;dur=${__tEnv}, origin;dur=${__tFetch}, json;dur=${__tJson}, total;dur=${Date.now() - __t0}`
      },
      request
    );

  } catch (err) {
    return jsonError(500, "full-post failed", err, request);
  }
}

function corsHeaders(req) {
  const reqOrigin = req.headers.get("Origin") || "";
  const allowedOrigin = "https://mrrogersweborhood.github.io";
  const path = new URL(req.url).pathname;

  const base = {
    "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
    "access-control-allow-headers":
      req.headers.get("access-control-request-headers") ||
      "content-type, authorization, x-requested-with",
    "access-control-max-age": "86400"
  };

  // If request comes from your GH Pages origin, allow credentials.
  if (reqOrigin === allowedOrigin) {
    return {
      ...base,
      "access-control-allow-origin": allowedOrigin,
      "access-control-allow-credentials": "true",
      "vary": "Origin"
    };
  }

  // Only allow wildcard CORS for public read-only routes
  const isPublicRoute =
    path.startsWith("/wp-json/") ||
    path.startsWith("/content/full-post") ||
    path.startsWith("/content/author-posts") ||
    path === "/" ||
    path === "/status";

  if (isPublicRoute) {
    return {
      ...base,
      "access-control-allow-origin": "*"
    };
  }

  // All other routes (auth, internal) get NO wildcard CORS
  return base;
}
function text(status, body, req, extraHeaders) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders(req),
      "content-type": "text/plain; charset=utf-8",
      ...(extraHeaders || {})
    }
  });
}

function json(status, obj, extraHeaders, req) {
  const headers = {
    ...corsHeaders(req),
    "content-type": "application/json; charset=utf-8",
    ...(extraHeaders || {})
  };
  return new Response(JSON.stringify(obj), { status, headers });
}

function jsonError(status, msg, err, req) {
  return json(
    status,
    {
      error: msg,
      detail: String(err?.message || err || ""),
      path: new URL(req.url).pathname
    },
    {
      "cache-control": "no-store",
      "pragma": "no-cache",
      "expires": "0"
    },
    req
  );
}
// 🔴 worker.js
// 🔴 worker.js
