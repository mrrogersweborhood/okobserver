// 🟢 worker.js
// OkObserver Cloudflare Worker — FULL REPLACEMENT (v2026-08-12a)
// (Filename is illustrative; paste into your Cloudflare Worker editor as the whole script.)
// 🟢 worker.js

/**
 * OkObserver Cloudflare Worker — FULL REPLACEMENT (v2026-08-12a)
 * - Proxies WordPress REST JSON from https://okobserver.org
 * - Adds /auth/login + /auth/logout for JWT cookie sessions
 * - Injects Authorization: Bearer <jwt> to upstream when cookie present
 * - Never caches authenticated requests
 * - CORS for GitHub Pages (credentials supported for your GH origin)
 * - /status health endpoint
 * - Friendly / root text for Cloudflare preview
 * - handleFullPost: visitor-JWT-authenticated, members-only/protected-content
 *   teaser responses, public edge caching via caches.default + ctx.waitUntil,
 *   authenticated requests always bypass that cache (current live behavior,
 *   preserved exactly by this revision -- not modified here).
 * - NEW (2026-08-12): /observer-intel/* — read-only Observer Intelligence
 *   endpoints (subscriber search/overview, subscription-status summary,
 *   editorial search) backed by the WooCommerce REST API. GET-only,
 *   requires a valid logged-in JWT session (same session as the app's own
 *   login), never public. WooCommerce credentials live only in
 *   env.WC_CONSUMER_KEY / env.WC_CONSUMER_SECRET (Cloudflare Worker
 *   secrets) and are never returned, logged, or forwarded to the client.
 */

const ORIGIN = "https://okobserver.org";
// 2026-10-05 SECURITY HARDENING (INTERNAL_WP_JSON_PASSTHROUGH_SECURITY_REMEDIATION_2026-10-05.md):
// the generic passthrough used to forward ANY method + body under the whole
// "/wp-json/" prefix with the caller's JWT. The only legitimate use is the
// SPA's read-only post/page feed, so the passthrough is now an explicit
// allowlist: GET/HEAD only, two route shapes, and a fixed query-parameter set.
// Everything else under /wp-json/ (users, wc/*, jwt-auth/*, oembed, index, ...)
// is rejected here, before any upstream call. Login/logout/status/validate and
// the /content/* + /observer-intel/* routes have their own dedicated handlers
// and never depend on this passthrough.
const PASSTHROUGH_METHODS = ["GET", "HEAD"];
const PASSTHROUGH_PATH_RE = /^\/wp-json\/wp\/v2\/(posts|pages)(\/\d+)?\/?$/;
const PASSTHROUGH_PARAMS = new Set(["per_page", "page", "_embed", "search", "slug", "nocache"]);

const WC_API_BASE = `${ORIGIN}/wp-json/wc/v3`;

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

/* ---------------- OBSERVER INTELLIGENCE: AUTH GATE ---------------- */
// Reuses the SAME WordPress JWT session as the app's existing /auth/login
// flow -- no new auth system. A request must carry a JWT (cookie or
// Authorization: Bearer) that WordPress's own jwt-auth/v1/token/validate
// route accepts. This is the narrowest protection that reuses 100%
// existing infrastructure; it is intentionally NOT public.
async function requireValidJwt(request) {
  const clientAuth = request.headers.get("Authorization") || "";
  let jwt = null;
  if (clientAuth.toLowerCase().startsWith("bearer ")) {
    jwt = clientAuth.slice(7).trim();
  } else {
    jwt = getJwtFromCookie(request);
  }
  if (!jwt) {
    return { valid: false, status: 401, message: "Authentication required." };
  }
  try {
    const resp = await fetchWithTimeout(
      `${ORIGIN}/wp-json/jwt-auth/v1/token/validate`,
      { method: "POST", headers: { "Authorization": `Bearer ${jwt}` } },
      6000
    );
    if (!resp.ok) {
      return { valid: false, status: 401, message: "Invalid or expired session." };
    }
    return { valid: true };
  } catch (err) {
    // Never log the JWT itself -- only that validation failed.
    console.error("[ObserverIntel] Session validation failed:", err?.name || "error");
    return { valid: false, status: 502, message: "Could not verify session." };
  }
}

/* ---------------- OBSERVER INTELLIGENCE: WOOCOMMERCE HELPERS ---------------- */

async function fetchWithTimeout(resource, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 8000);
  try {
    return await fetch(resource, { ...(init || {}), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Builds the WooCommerce Basic-Auth header from server-side-only secrets.
// The returned string is used exactly once, as an outgoing request header,
// and is never logged, returned to the client, or included in any error
// payload. If either secret is missing, callers get a clean 500 instead
// of a confusing upstream 401.
function wcAuthHeader(env) {
  const key = env && env.WC_CONSUMER_KEY ? String(env.WC_CONSUMER_KEY) : "";
  const secret = env && env.WC_CONSUMER_SECRET ? String(env.WC_CONSUMER_SECRET) : "";
  if (!key || !secret) return null;
  return "Basic " + btoa(`${key}:${secret}`);
}

// The ONLY function in this file allowed to call the WooCommerce REST API.
// GET-only by construction (no method parameter exists to override this).
// Never logs the response body (may contain customer PII) -- only status.
async function wcGet(path, params, env) {
  const authHeader = wcAuthHeader(env);
  if (!authHeader) {
    return { ok: false, status: 500, error: "WooCommerce credentials are not configured on this Worker." };
  }
  const upstream = new URL(`${WC_API_BASE}${path}`);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") upstream.searchParams.set(k, String(v));
  });

  let resp;
  try {
    resp = await fetchWithTimeout(
      upstream.toString(),
      { method: "GET", headers: { "Authorization": authHeader, "Accept": "application/json" } },
      8000
    );
  } catch (err) {
    const timedOut = err && err.name === "AbortError";
    console.error("[ObserverIntel] WooCommerce fetch failed:", timedOut ? "timeout" : (err?.name || "error"), path);
    return { ok: false, status: timedOut ? 504 : 502, error: timedOut ? "WooCommerce upstream timed out." : "WooCommerce upstream fetch failed." };
  }

  const rawText = await resp.text();
  let data = null;
  try { data = rawText ? JSON.parse(rawText) : null; } catch (_) { data = null; }

  if (!resp.ok) {
    console.error("[ObserverIntel] WooCommerce API error:", resp.status, path); // status + path only, never body
    return {
      ok: false,
      status: resp.status,
      error: (data && (data.message || data.code)) ? String(data.message || data.code).slice(0, 200) : "WooCommerce API error.",
    };
  }
  return { ok: true, status: resp.status, data, headers: resp.headers };
}

// Fetches ALL pages of a WooCommerce list endpoint, honoring X-WP-TotalPages
// so summary counts are never accidentally based on just the first page.
// Capped by maxPages as a safety/timeout bound; if the real data exceeds
// the cap, `truncated: true` is reported honestly rather than silently
// under-counting.
async function wcGetAllPages(path, params, env, opts) {
  const perPage = (opts && opts.perPage) || 100;
  const maxPages = (opts && opts.maxPages) || 20;
  let page = 1;
  let items = [];
  let totalPages = 1;

  while (page <= maxPages) {
    const result = await wcGet(path, { ...(params || {}), per_page: perPage, page }, env);
    if (!result.ok) {
      return { ok: false, status: result.status, error: result.error };
    }
    items = items.concat(Array.isArray(result.data) ? result.data : []);
    const headerTotalPages = result.headers && result.headers.get ? parseInt(result.headers.get("x-wp-totalpages") || "1", 10) : 1;
    totalPages = Number.isFinite(headerTotalPages) && headerTotalPages > 0 ? headerTotalPages : 1;
    if (page >= totalPages) break;
    page += 1;
  }

  return {
    ok: true,
    items,
    totalPages,
    pagesFetched: Math.min(page, maxPages),
    truncated: totalPages > maxPages,
  };
}

// Curated, safe error text only -- never the raw upstream error body.
function sanitizeWcError(result) {
  if (result.status === 401 || result.status === 403) return "WooCommerce credentials were rejected by the upstream API.";
  if (result.status === 404) return "Not found.";
  if (result.status === 504) return "WooCommerce upstream timed out.";
  return typeof result.error === "string" ? result.error : "WooCommerce API error.";
}

function stripTags(html) {
  return String(html || "").replace(/<[^>]*>/g, "").trim();
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

/* ------------------ AUTH STATUS (must come before the passthrough gate) ------------------ */
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
/* ------------------ AUTHOR POSTS (must come before the passthrough gate) ------------------ */
if (url.pathname === "/content/author-posts" && request.method === "GET") {
  return handleAuthorPosts(request, url, env);
}
/* ------------------ FULL POST (must come before the passthrough gate) ------------------ */
if (url.pathname === "/content/full-post" && request.method === "GET") {
  return handleFullPost(request, url, env, ctx);
}

/* ------------------ OBSERVER INTELLIGENCE (must come before the passthrough gate) ------------------
 * Read-only, GET-only, requires a valid logged-in JWT session (same as the
 * app's own /auth/login) -- NEVER an unauthenticated public window into
 * subscriber/customer data. See module header for details.
 */
if (url.pathname.startsWith("/observer-intel/")) {
  if (request.method !== "GET") {
    return json(
      405,
      { error: "Method not allowed. Observer Intelligence endpoints are read-only (GET)." },
      { "cache-control": "no-store", "pragma": "no-cache", "expires": "0" },
      request
    );
  }
  const authCheck = await requireValidJwt(request);
  if (!authCheck.valid) {
    return json(
      authCheck.status,
      { error: authCheck.message },
      { "cache-control": "no-store", "pragma": "no-cache", "expires": "0" },
      request
    );
  }
  return routeObserverIntel(request, url, env);
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

    /* ---------- Passthrough gate: read-only, explicit allowlist ---------- */
    // Order matters: method first (405, with Allow), then path (403), and
    // both run BEFORE any upstream fetch or JWT forwarding. OPTIONS preflight,
    // /status, /auth/*, /content/* and /observer-intel/* are answered by
    // their own handlers above and never reach this point.
    if (!PASSTHROUGH_METHODS.includes(request.method)) {
      return text(
        405,
        "Method not allowed",
        request,
        {
          "allow": PASSTHROUGH_METHODS.join(", "),
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0"
        }
      );
    }
    if (!PASSTHROUGH_PATH_RE.test(url.pathname)) {
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
    // Only allowlisted query parameters are forwarded (so e.g. context=edit,
    // status=draft or _fields can never be requested through this route).
    // Dropped parameter NAMES (never values) are reported in a debug header.
    const upstream = new URL(`${ORIGIN}${url.pathname}`);
    const droppedParams = [];
    for (const [name, value] of url.searchParams) {
      if (PASSTHROUGH_PARAMS.has(name)) upstream.searchParams.append(name, value);
      else droppedParams.push(name);
    }

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
      // Defense in depth: the gate above already rejects every non-GET/HEAD
      // request, so a body is never forwarded.
      body: undefined,
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
    outHeaders.set("access-control-allow-methods", "GET,HEAD,OPTIONS");
    if (droppedParams.length) {
      outHeaders.set("x-proxy-dropped-params", droppedParams.join(",").slice(0, 200));
    }
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

/* ---------------- OBSERVER INTELLIGENCE: ROUTES ---------------- */

async function routeObserverIntel(request, url, env) {
  const path = url.pathname.slice("/observer-intel".length) || "/";

  if (path === "/subscribers/search") {
    return handleSubscriberSearch(request, url, env);
  }
  const overviewMatch = path.match(/^\/subscribers\/(\d+)\/overview$/);
  if (overviewMatch) {
    return handleSubscriberOverview(request, url, env, overviewMatch[1]);
  }
  if (path === "/subscriptions/summary") {
    return handleSubscriptionSummary(request, url, env);
  }
  if (path === "/posts/search") {
    return handlePostsSearch(request, url, env);
  }
  return json(
    404,
    { error: "Unknown Observer Intelligence route." },
    { "cache-control": "no-store", "pragma": "no-cache", "expires": "0" },
    request
  );
}

// GET /observer-intel/subscribers/search?q=<name-or-email>
// Searches BOTH /wc/v3/customers and /wc/v3/memberships/members, then merges
// by underlying WordPress user id -- a WooCommerce Memberships member can
// legitimately have no order history and therefore no independent
// "customer" footprint, and must still be discoverable here (see
// OBSERVER_INTELLIGENCE_MEMBERSHIP_GAP_FINDINGS_2026-08-12.md for why the
// original customers-only search missed people like this).
async function handleSubscriberSearch(request, url, env) {
  try {
    const raw = (url.searchParams.get("q") || "").trim().replace(/\s+/g, " ");
    if (raw.length < 2) {
      return json(
        400,
        { error: "Query must be at least 2 characters." },
        { "cache-control": "no-store" },
        request
      );
    }

    const looksLikeEmail = raw.includes("@");
    const [customersResult, membershipsResult] = await Promise.all([
      wcGet("/customers", { search: raw, per_page: 10 }, env),
      // `customer` is a more precise match ("ID, login name, or email
      // address") than the free-text `search` param -- use both so an
      // email-shaped query gets the precise lookup too, not just the
      // fuzzy one.
      looksLikeEmail
        ? wcGet("/memberships/members", { customer: raw, per_page: 10 }, env)
        : wcGet("/memberships/members", { search: raw, per_page: 10 }, env),
    ]);

    if (!customersResult.ok && !membershipsResult.ok) {
      const status = customersResult.status >= 400 && customersResult.status < 600 ? customersResult.status : 502;
      return json(status, { error: sanitizeWcError(customersResult) }, { "cache-control": "no-store" }, request);
    }

    // Merge key is the underlying WordPress user id -- /wc/v3/customers'
    // own `id` IS that user id; a membership record's `customer_id` field
    // is the same user id (its own `id` is the membership's id, NOT the
    // user's -- never merge on that).
    const byUserId = new Map();

    const customers = customersResult.ok && Array.isArray(customersResult.data) ? customersResult.data : [];
    for (const c of customers) {
      byUserId.set(c.id, {
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.username || null,
        email: c.email || null,
        username: c.username || null,
        is_customer: true,
        is_member: false,
      });
    }

    const memberships = membershipsResult.ok && Array.isArray(membershipsResult.data) ? membershipsResult.data : [];
    const missingCustomerIds = [...new Set(memberships.map((m) => m.customer_id).filter((cid) => cid && !byUserId.has(cid)))].slice(0, 10);

    // A membership record may not carry the member's name/email inline --
    // resolve identity for anyone found ONLY via memberships, bounded so
    // this can't turn into an unbounded fan-out.
    const identityLookups = await Promise.all(
      missingCustomerIds.map((cid) => wcGet(`/customers/${cid}`, {}, env))
    );
    missingCustomerIds.forEach((cid, i) => {
      const res = identityLookups[i];
      if (res.ok && res.data) {
        const c = res.data;
        byUserId.set(cid, {
          id: c.id,
          name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.username || null,
          email: c.email || null,
          username: c.username || null,
          is_customer: true,
          is_member: false,
        });
      } else {
        // Genuinely no WooCommerce customer resource for this WordPress
        // user id -- still surface them (requirement: a member-only
        // person must remain discoverable) rather than dropping them.
        byUserId.set(cid, {
          id: cid,
          name: null,
          email: null,
          username: null,
          is_customer: false,
          is_member: false,
        });
      }
    });

    for (const m of memberships) {
      const cid = m.customer_id;
      if (!cid || !byUserId.has(cid)) continue;
      byUserId.get(cid).is_member = true;
    }

    const results = Array.from(byUserId.values()).map((r) => ({
      id: r.id,
      name: r.name || (r.is_customer || r.is_member ? "(no name on file)" : null),
      email: r.email,
      username: r.username,
      is_customer: r.is_customer,
      is_member: r.is_member,
    }));

    const warnings = [];
    if (!customersResult.ok) warnings.push("Customer search failed: " + sanitizeWcError(customersResult));
    if (!membershipsResult.ok) warnings.push("Membership search failed: " + sanitizeWcError(membershipsResult));

    return json(
      200,
      {
        query: raw,
        count: results.length,
        results,
        ...(warnings.length ? { warnings } : {}),
      },
      { "cache-control": "no-store" },
      request
    );
  } catch (err) {
    return jsonError(500, "subscriber search failed", err, request);
  }
}

// GET /observer-intel/subscribers/<customer-id>/overview
// `id` is a WordPress user id. A WooCommerce Memberships member can
// legitimately have no customer/order record at all -- this handler only
// 404s if NEITHER a customer record NOR a membership record exists for
// that id, per the explicit requirement not to treat "member with no
// purchase history" as an error.
async function handleSubscriberOverview(request, url, env, idStr) {
  try {
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return json(400, { error: "Invalid customer id." }, { "cache-control": "no-store" }, request);
    }

    const [customerResult, membershipsResult, ordersResult, subsResult] = await Promise.all([
      wcGet(`/customers/${id}`, {}, env),
      wcGet("/memberships/members", { customer: id, per_page: 20 }, env),
      wcGetAllPages("/orders", { customer: id }, env, { perPage: 100, maxPages: 10 }),
      wcGetAllPages("/subscriptions", { customer: id }, env, { perPage: 100, maxPages: 5 }),
    ]);

    const hasCustomerRecord = customerResult.ok && !!customerResult.data;
    const memberships = membershipsResult.ok && Array.isArray(membershipsResult.data) ? membershipsResult.data : [];
    const hasMembershipRecord = memberships.length > 0;

    if (!hasCustomerRecord && !hasMembershipRecord) {
      // Genuinely nothing under this id -- a real 404, not a data gap.
      const status = customerResult.status === 404 ? 404 : (customerResult.status >= 400 && customerResult.status < 600 ? customerResult.status : 404);
      return json(status, { error: "No customer or membership record found with that id." }, { "cache-control": "no-store" }, request);
    }

    const c = hasCustomerRecord ? customerResult.data : null;

    // Resolve plan names for whatever plan_ids appear (bounded -- almost
    // always 1, capped so this can never become an unbounded fan-out).
    const planIds = [...new Set(memberships.map((m) => m.plan_id).filter(Boolean))].slice(0, 5);
    const planLookups = await Promise.all(planIds.map((pid) => wcGet(`/memberships/plans/${pid}`, {}, env)));
    const planNameById = new Map();
    planIds.forEach((pid, i) => {
      const res = planLookups[i];
      if (res.ok && res.data && res.data.name) planNameById.set(pid, res.data.name);
    });

    const orders = ordersResult.ok ? ordersResult.items : [];
    const subscriptions = subsResult.ok ? subsResult.items : [];

    const PAID_STATUSES = ["completed", "processing"];
    const paidOrders = orders.filter((o) => PAID_STATUSES.includes(o.status));
    const paidRevenueTotal = paidOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
    const orderDates = orders.map((o) => o.date_created).filter(Boolean).sort();

    // Order notes: bounded, best-effort, only for a handful of the most
    // recent orders -- fetching notes for every order would be an N+1
    // request storm for customers with a long order history.
    const MAX_NOTE_ORDERS = 3;
    const MAX_NOTES_PER_ORDER = 5;
    const recentForNotes = [...orders]
      .sort((a, b) => (b.date_created || "").localeCompare(a.date_created || ""))
      .slice(0, MAX_NOTE_ORDERS);

    const orderNotes = [];
    for (const o of recentForNotes) {
      const notesResult = await wcGet(`/orders/${o.id}/notes`, {}, env);
      if (notesResult.ok && Array.isArray(notesResult.data)) {
        for (const n of notesResult.data.slice(0, MAX_NOTES_PER_ORDER)) {
          orderNotes.push({
            order_id: o.id,
            date_created: n.date_created || null,
            note: n.note || null,
            customer_note: !!n.customer_note,
          });
        }
      }
    }

    const activeSubscriptionCount = subscriptions.filter((s) => s.status === "active").length;

    const overview = {
      customer: hasCustomerRecord
        ? {
            id: c.id,
            name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.username || null,
            email: c.email || null,
            username: c.username || null,
            date_created: c.date_created || null,
          }
        : {
            id,
            name: null,
            email: null,
            username: null,
            date_created: null,
            note: "No WooCommerce customer record exists for this WordPress user id -- this person has no order history under this account. Identity is limited to what the membership record itself provides (see memberships[].customer_id).",
          },
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        status: s.status || null,
        start_date: s.start_date_gmt || s.date_created || null,
        next_payment_date: s.next_payment_date_gmt || null,
        end_date: s.end_date_gmt || s.end_date || null,
        total: s.total || null,
        currency: s.currency || null,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        status: o.status || null,
        date_created: o.date_created || null,
        total: o.total || null,
        currency: o.currency || null,
      })),
      order_notes: orderNotes,
      order_notes_scope: `Most recent ${MAX_NOTE_ORDERS} orders only, up to ${MAX_NOTES_PER_ORDER} notes each (avoids one request per order).`,
      metrics: {
        order_count: orders.length,
        orders_truncated: !!ordersResult.truncated,
        paid_revenue_total: Math.round(paidRevenueTotal * 100) / 100,
        currency: orders.length ? orders[0].currency || null : null,
        first_order_date: orderDates.length ? orderDates[0] : null,
        most_recent_order_date: orderDates.length ? orderDates[orderDates.length - 1] : null,
        active_subscription_count: activeSubscriptionCount,
        subscriptions_truncated: !!subsResult.truncated,
      },
      metric_definitions: {
        paid_revenue_total: `Sum of order.total for this customer's orders with status in [${PAID_STATUSES.join(", ")}] (WooCommerce's own paid-order statuses). This is NOT a "lifetime value" calculation -- it does not add tax/shipping adjustments beyond what WooCommerce already applied to order.total, and it excludes non-paid statuses (on-hold, pending, cancelled, refunded, failed).`,
        active_subscription_count: 'Count of subscriptions with status exactly "active" at the time this request ran.',
        order_count: "Count of orders returned for this customer (see orders_truncated if the safety page cap was hit).",
      },
      memberships: memberships.map((m) => ({
        id: m.id,
        plan_id: m.plan_id != null ? m.plan_id : null,
        plan_name: (m.plan_id != null && planNameById.has(m.plan_id)) ? planNameById.get(m.plan_id) : null,
        status: m.status || null,
        start_date: m.start_date_gmt || m.start_date || m.date_created_gmt || m.date_created || null,
        end_date: m.end_date_gmt || m.end_date || null,
        customer_id: m.customer_id != null ? m.customer_id : id,
        order_id: m.order_id != null ? m.order_id : null,
      })),
      membership_summary: {
        is_member: hasMembershipRecord,
        active_membership_count: memberships.filter((m) => m.status === "active").length,
        memberships_truncated: memberships.length >= 20,
      },
      generated_at: new Date().toISOString(),
      source: "live-read-only",
    };

    return json(200, overview, { "cache-control": "no-store" }, request);
  } catch (err) {
    return jsonError(500, "subscriber overview failed", err, request);
  }
}

// GET /observer-intel/subscriptions/summary
async function handleSubscriptionSummary(request, url, env) {
  try {
    const result = await wcGetAllPages("/subscriptions", {}, env, { perPage: 100, maxPages: 30 });
    if (!result.ok) {
      return json(502, { error: sanitizeWcError(result) }, { "cache-control": "no-store" }, request);
    }

    const counts = new Map();
    for (const s of result.items) {
      const status = s && s.status ? String(s.status) : "unknown";
      counts.set(status, (counts.get(status) || 0) + 1);
    }
    const statuses = Array.from(counts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    return json(
      200,
      {
        total: result.items.length,
        statuses,
        truncated: !!result.truncated,
        pages_fetched: result.pagesFetched,
        generated_at: new Date().toISOString(),
        source: "live-read-only",
      },
      { "cache-control": "no-store" },
      request
    );
  } catch (err) {
    return jsonError(500, "subscription summary failed", err, request);
  }
}

// GET /observer-intel/posts/search?q=<query>&category=<optional-slug>
// Editorial search spike (Task 6) -- reuses the same public WP REST data
// the app already reads; normalizes the shape instead of exposing raw
// WordPress post objects.
async function handlePostsSearch(request, url, env) {
  try {
    const q = (url.searchParams.get("q") || "").trim();
    const category = (url.searchParams.get("category") || "").trim();
    if (q.length < 2) {
      return json(400, { error: "Query must be at least 2 characters." }, { "cache-control": "no-store" }, request);
    }

    let categoryId = null;
    if (category) {
      const catUpstream = new URL(`${ORIGIN}/wp-json/wp/v2/categories`);
      catUpstream.searchParams.set("slug", category);
      const catResp = await fetchWithTimeout(catUpstream.toString(), { method: "GET" }, 6000);
      const catData = await catResp.json().catch(() => null);
      if (Array.isArray(catData) && catData.length) categoryId = catData[0].id;
    }

    const upstream = new URL(`${ORIGIN}/wp-json/wp/v2/posts`);
    upstream.searchParams.set("search", q);
    upstream.searchParams.set("per_page", "10");
    upstream.searchParams.set("_embed", "author,wp:term");
    if (categoryId) upstream.searchParams.set("categories", String(categoryId));

    const resp = await fetchWithTimeout(upstream.toString(), { method: "GET" }, 8000);
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !Array.isArray(data)) {
      return json(502, { error: "Editorial search failed upstream." }, { "cache-control": "no-store" }, request);
    }

    const results = data.map((p) => ({
      id: p.id,
      title: p.title && p.title.rendered ? stripTags(p.title.rendered) : null,
      date: p.date || null,
      link: p.link || null,
      author: p._embedded && p._embedded.author && p._embedded.author[0] ? p._embedded.author[0].name : null,
      categories:
        p._embedded && p._embedded["wp:term"] && p._embedded["wp:term"][0]
          ? p._embedded["wp:term"][0].map((t) => t.name)
          : [],
    }));

    return json(
      200,
      { query: q, category: category || null, count: results.length, results },
      { "cache-control": "no-store" },
      request
    );
  } catch (err) {
    return jsonError(500, "posts search failed", err, request);
  }
}

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

async function handleFullPost(request, url, env, ctx) {
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

    const jwt = getJwtFromCookie(request);
    const isAuthenticated = !!(jwt && jwt.trim());

    const __tEnv0 = Date.now();
    __tEnv = Date.now() - __tEnv0;

    const upstream = new URL(`${ORIGIN}/wp-json/wp/v2/posts/${encodeURIComponent(id)}`);
    upstream.searchParams.set("_embed", "author,wp:featuredmedia,wp:term");

    const publicCacheable =
      request.method === "GET" &&
      !isAuthenticated &&
      !url.searchParams.has(NOCACHE_QS);

    const cacheKey = new Request(`https://cache.okobserver/full-post?id=${encodeURIComponent(id)}`, {
      method: "GET"
    });

    if (!isAuthenticated) {
      const cached = await caches.default.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("x-oo-cache", "hit");
        headers.set("x-oo-debug-cache-key", cacheKey.url);
        headers.set("x-oo-debug-public-cacheable", "1");
        headers.set("x-oo-debug-authenticated", "0");
        return new Response(cached.body, {
          status: cached.status,
          headers
        });
      }
    }

    const requestHeaders = {
      "Accept": "application/json"
    };

    if (isAuthenticated) {
      requestHeaders["Authorization"] = `Bearer ${jwt.trim()}`;
    }

    const __tFetch0 = Date.now();
    let resp = await fetch(upstream.toString(), {
      method: "GET",
      headers: requestHeaders,
      cf: publicCacheable
        ? {
            cacheEverything: true,
            cacheTtlByStatus: {
              "200-299": 300,
              "300-399": 60,
              "401": 0,
              "403": 0,
              "404": 0,
              "500-599": 0
            }
          }
        : undefined
    });

    if (isAuthenticated && resp.status === 401) {
      resp = await fetch(upstream.toString(), {
        method: "GET",
        headers: {
          "Accept": "application/json"
        },
        cf: undefined
      });
    }

    __tFetch = Date.now() - __tFetch0;

    const __tJson0 = Date.now();
    const data = await resp.json().catch(() => null);
    __tJson = Date.now() - __tJson0;

    const timingHeaders = {
      "x-oo-env-ms": String(__tEnv),
      "x-oo-origin-ms": String(__tFetch),
      "x-oo-json-ms": String(__tJson),
      "x-oo-total-ms": String(Date.now() - __t0),
      "server-timing": `env;dur=${__tEnv}, origin;dur=${__tFetch}, json;dur=${__tJson}, total;dur=${Date.now() - __t0}`
    };

    if (!resp.ok) {
      const upstreamMessage =
        (data && typeof data === "object" && (
          data.message ||
          data.error ||
          (data.data && data.data.message)
        )) || "";

      const looksProtected =
        resp.status === 401 ||
        resp.status === 403 ||
        /members?\s*only/i.test(String(upstreamMessage)) ||
        /protected/i.test(String(upstreamMessage)) ||
        /forbidden/i.test(String(upstreamMessage)) ||
        /not allowed/i.test(String(upstreamMessage));

      if (looksProtected) {
        return json(
          200,
          {
            ok: true,
            protected: true,
            id: Number(id),
            excerpt: "",
            message: "This content is for members only"
          },
          {
            "cache-control": "no-store",
            "pragma": "no-cache",
            "expires": "0",
            "x-oo-cache": "bypass",
            "x-oo-debug-cache-key": cacheKey.url,
            "x-oo-debug-public-cacheable": publicCacheable ? "1" : "0",
            "x-oo-debug-authenticated": isAuthenticated ? "1" : "0",
            ...timingHeaders
          },
          request
        );
      }

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
          "expires": "0",
          "x-oo-debug-cache-key": cacheKey.url,
          "x-oo-debug-public-cacheable": publicCacheable ? "1" : "0",
          "x-oo-debug-authenticated": isAuthenticated ? "1" : "0",
          ...timingHeaders
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
          "x-oo-debug-cache-key": cacheKey.url,
          "x-oo-debug-public-cacheable": publicCacheable ? "1" : "0",
          "x-oo-debug-authenticated": isAuthenticated ? "1" : "0",
          ...timingHeaders
        },
        request
      );
    }

    const protectedFlag =
      !!data.password ||
      !!data.content?.protected ||
      !!data.excerpt?.protected;

    if (protectedFlag) {
      return json(
        200,
        {
          ok: true,
          protected: true,
          id: data.id || Number(id),
          excerpt:
            (data.excerpt && typeof data.excerpt.rendered === "string")
              ? data.excerpt.rendered
              : "",
          message: "This content is for members only",
          post: {
            id: data.id || Number(id),
            title: data.title || { rendered: "" },
            date: data.date || "",
            excerpt: data.excerpt || { rendered: "" },
            _embedded: data._embedded || {}
          }
        },
        {
          "cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0",
          "x-oo-cache": "bypass",
          "x-oo-debug-cache-key": cacheKey.url,
          "x-oo-debug-public-cacheable": publicCacheable ? "1" : "0",
          "x-oo-debug-authenticated": isAuthenticated ? "1" : "0",
          ...timingHeaders
        },
        request
      );
    }

    const response = json(
      200,
      { ok: true, post: data },
      {
        "cache-control": publicCacheable ? "public, max-age=300" : "no-store",
        "pragma": publicCacheable ? "public" : "no-cache",
        "expires": publicCacheable ? new Date(Date.now() + 300000).toUTCString() : "0",
        "x-oo-cache": publicCacheable ? "miss" : "bypass",
        "x-oo-debug-cache-key": cacheKey.url,
        "x-oo-debug-public-cacheable": publicCacheable ? "1" : "0",
        "x-oo-debug-authenticated": isAuthenticated ? "1" : "0",
        ...timingHeaders
      },
      request
    );

    if (response.ok && !isAuthenticated && ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    }

    return response;

  } catch (err) {
    return jsonError(500, "full-post failed", err, request);
  }
}
function corsHeaders(req) {
  const reqOrigin = req.headers.get("Origin") || "";
  const allowedOrigin = "https://mrrogersweborhood.github.io";
  const path = new URL(req.url).pathname;

  const base = {
    // POST is only needed for the /auth/* login/logout preflight; every other
    // route (passthrough, /content/*, /observer-intel/*) is read-only.
    "access-control-allow-methods": path.startsWith("/auth/") ? "GET,HEAD,POST,OPTIONS" : "GET,HEAD,OPTIONS",
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