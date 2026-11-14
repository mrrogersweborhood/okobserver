// 🟢 worker.js
// OkObserver Cloudflare Worker — FULL REPLACEMENT (v2025-12-13a)
// (Filename is illustrative; paste into your Cloudflare Worker editor as the whole script.)
// 🟢 worker.js

/**
 * OkObserver Cloudflare Worker — FULL REPLACEMENT (v2025-12-13a)
 * - Proxies WordPress REST JSON from ORIGIN (see the ORIGIN setting below)
 * - Adds /auth/login + /auth/logout for JWT cookie sessions
 * - Injects Authorization: Bearer <jwt> to upstream when cookie present
 * - Never caches authenticated requests
 * - CORS for GitHub Pages (credentials supported for your GH origin)
 * - /status health endpoint
 * - Friendly / root text for Cloudflare preview
 */

// WHICH WEBSITE THE APP READS (the ONE place to change it):
//   TESTING (app not public yet): the new staging site.
//   AT LAUNCH: change to "https://okobserver.org" and redeploy this Worker.
const ORIGIN = "https://okobserverstaging.tempurl.host";
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
/* ------------------ EVENTS (Observer's public Google Calendar; must come before API_ALLOW gate) ------------------ */
if (url.pathname === "/content/events" && request.method === "GET") {
  return handleEvents(request);
}
/* ------------------ TOPIC INDEX (the website's own Index list, shared with the app) ------------------ */
if (url.pathname === "/content/topic-index" && request.method === "GET") {
  return handleTopicIndex(request, env);
}
/* ------------------ ABOUT PAGE (the website's own designed About page, shared with the app) ------------------ */
if (url.pathname === "/content/about-page" && request.method === "GET") {
  return handleAboutPage(request, env);
}
/* ------------------ HOME EXTRAS (sponsor strip + Featured Columnists, read from the site's home page) ------------------ */
if (url.pathname === "/content/home-extras" && request.method === "GET") {
  return handleHomeExtras(request, env);
}
/* ------------------ AUTHOR ARCHIVES (app Archives screens; must come before API_ALLOW gate) ------------------ */
// WordPress/the host firewall block anonymous /users and ?author= requests, so these two read-only routes
// build author lists from ordinary public post lists instead (no login needed; summary fields only, no post body).
if (url.pathname === "/content/authors" && request.method === "GET") {
  return handleAuthorsList(request, env);
}
if (url.pathname === "/content/author-archive" && request.method === "GET") {
  return handleAuthorArchive(request, url, env);
}
/* ------------------ FULL POST (must come before API_ALLOW gate) ------------------ */
if (url.pathname === "/content/full-post" && request.method === "GET") {
  return handleFullPost(request, url, env, ctx);
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
const NO_STORE = { "cache-control": "no-store", "pragma": "no-cache", "expires": "0" };

function basicAuthHeaders(env) {
  const basic = env && env.WP_BASIC_AUTH ? String(env.WP_BASIC_AUTH).trim() : "";
  if (!basic) return null;
  return { "Authorization": `Basic ${basic}`, "Accept": "application/json" };
}

// ---- Events: the Observer's public Google Calendar, turned into simple JSON for the app ----
// Same calendar the website's /calendar page uses. Works the same before and after launch.
const EVENTS_ICS_URL =
  "https://calendar.google.com/calendar/ical/c_022aa19feddf5005040e15ca786f4ad617a31388f97a591846f5efc32464080c%40group.calendar.google.com/public/basic.ics";

function icsUnescape(s) {
  return String(s || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
function icsDate(v) {
  // 20261114T000000Z  or  20261114 (all-day)
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(String(v || "").trim());
  if (!m) return null;
  if (m[4] === undefined) return { iso: `${m[1]}-${m[2]}-${m[3]}T12:00:00Z`, allDay: true };
  return { iso: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`, allDay: false };
}
function parseIcs(text) {
  const unfolded = String(text || "").replace(/\r?\n[ \t]/g, "");
  const events = [];
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  for (const raw of blocks) {
    const body = raw.split("END:VEVENT")[0];
    const f = {};
    for (const line of body.split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i < 1) continue;
      const name = line.slice(0, i).split(";")[0].toUpperCase();
      if (!(name in f)) f[name] = line.slice(i + 1);
    }
    const start = icsDate(f["DTSTART"]);
    if (!start || /CANCELLED/i.test(f["STATUS"] || "")) continue;
    const end = icsDate(f["DTEND"]) || start;
    events.push({
      title: icsUnescape(f["SUMMARY"]) || "Event",
      start: start.iso,
      end: end.iso,
      allDay: start.allDay,
      location: icsUnescape(f["LOCATION"]),
      description: icsUnescape(f["DESCRIPTION"])
    });
  }
  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}
async function handleEvents(request) {
  try {
    const resp = await fetch(EVENTS_ICS_URL, { headers: { "Accept": "text/calendar" } });
    if (!resp.ok) return json(502, { ok: false, error: "Calendar feed unavailable", status: resp.status }, NO_STORE, request);
    const events = parseIcs(await resp.text());
    return json(200, { ok: true, events }, { "cache-control": "public, max-age=600" }, request);
  } catch (err) {
    return jsonError(500, "events failed", err, request);
  }
}

// GET /content/home-extras -> { ok, sponsors:[{name,href,img}], columnists:[{name,href,img}] }
// The sponsor strip and Featured Columnists grid are built by the website, so the app reads them from the home
// page's HTML (one fetch, remembered 15 minutes) and the app always shows exactly what the website shows.
function htmlAttr(tag, name) {
  const m = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i"));
  return m ? (m[2] !== undefined ? m[2] : m[3]) : "";
}
function htmlText(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&#039;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}
function absUrl(u) {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return "https:" + u;
  return ORIGIN + (u.startsWith("/") ? "" : "/") + u;
}
function parseHomeExtras(html) {
  const sponsors = [];
  const sRe = /<a\b[^>]*okobserver-sponsor-card[^>]*>[\s\S]*?<\/a>/gi;
  let m;
  while ((m = sRe.exec(html))) {
    const block = m[0];
    const tag = block.slice(0, block.indexOf(">") + 1);
    const imgTag = (block.match(/<img\b[^>]*>/i) || [""])[0];
    const img = htmlAttr(imgTag, "data-src") || htmlAttr(imgTag, "src");
    if (!img || img.startsWith("data:")) continue;
    sponsors.push({ name: htmlAttr(tag, "aria-label") || htmlAttr(imgTag, "alt"), href: htmlAttr(tag, "href"), img: absUrl(img) });
  }
  const columnists = [];
  const seen = new Set();
  const cRe = /<a\b[^>]*okobserver-author-card-inner[^>]*>[\s\S]*?<\/a>/gi;
  while ((m = cRe.exec(html))) {
    const block = m[0];
    const tag = block.slice(0, block.indexOf(">") + 1);
    const imgTag = (block.match(/<img\b[^>]*>/i) || [""])[0];
    const nameM = block.match(/okobserver-author-name[^>]*>([\s\S]*?)<\/span>/i);
    const name = htmlText(nameM ? nameM[1] : "");
    const href = htmlAttr(tag, "href");
    const img = htmlAttr(imgTag, "data-src") || htmlAttr(imgTag, "src");
    if (!name || !href || seen.has(href)) continue;
    seen.add(href);
    columnists.push({ name, href, img: img && !img.startsWith("data:") ? absUrl(img) : "" });
  }
  // "Shop the Observer" picture + page
  const shopImg = (html.match(/https?:[^"'\s)]*Observer-Shop-booth[^"'\s)]*?\.(?:webp|jpe?g|png)/i) || [""])[0];
  const shop = shopImg ? { img: shopImg, href: ORIGIN + "/shop-for-subscriptions-and-clothing/" } : null;
  return { sponsors, columnists, shop };
}
// The website builds its Index (topic list) into one JSON file whose name changes whenever the list is rebuilt.
// This finds the current file from the site's own /index/ page and serves it to the app, cached at the edge
// for an hour, so the app and the website always share one list and nothing is copied by hand.
async function handleTopicIndex(request, env) {
  try {
    const cache = caches.default;
    const key = new Request("https://oo-cache.invalid/topic-index-v1");
    const hit = await cache.match(key);
    const out = { ...corsHeaders(request), "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" };
    if (hit) return new Response(await hit.text(), { status: 200, headers: out });
    const headers = basicAuthHeaders(env) || { "Accept": "text/html" };
    const page = await fetch(ORIGIN + "/index/", { headers });
    if (!page.ok) return json(502, { ok: false, error: "Index page unavailable", status: page.status }, NO_STORE, request);
    const m = (await page.text()).match(/id="oogl"[^>]*data-index="([^"]+)"/);
    const src = m ? m[1].replace(/&amp;/g, "&") : "";
    if (!src.startsWith(ORIGIN + "/wp-content/uploads/oo-glossary/")) return json(502, { ok: false, error: "Index file not found" }, NO_STORE, request);
    const file = await fetch(src, { headers: basicAuthHeaders(env) || { "Accept": "application/json" } });
    if (!file.ok) return json(502, { ok: false, error: "Index file unavailable", status: file.status }, NO_STORE, request);
    const body = await file.text();
    await cache.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "max-age=3600" } }));
    return new Response(body, { status: 200, headers: out });
  } catch (err) {
    return jsonError(500, "topic index failed", err, request);
  }
}

// The website builds its About page as a designed block (<div class="ooan">). This reads that block from the
// rendered page, makes its picture and link addresses absolute and returns it for the app, cached for an hour.
async function handleAboutPage(request, env) {
  try {
    const cache = caches.default;
    const key = new Request("https://oo-cache.invalid/about-page-v1");
    const out = { "cache-control": "public, max-age=3600" };
    const hit = await cache.match(key);
    if (hit) return json(200, await hit.json(), out, request);
    const resp = await fetch(ORIGIN + "/about/", { headers: basicAuthHeaders(env) || { "Accept": "text/html" } });
    if (!resp.ok) return json(502, { ok: false, error: "About page unavailable", status: resp.status }, NO_STORE, request);
    const page = await resp.text();
    const start = page.indexOf('<div class="ooan">');
    if (start < 0) return json(502, { ok: false, error: "About block not found" }, NO_STORE, request);
    let depth = 0, end = -1;
    const re = /<(\/?)div\b[^>]*>/g;
    re.lastIndex = start;
    let m;
    while ((m = re.exec(page))) {
      if (m[1] === "") depth++; else { depth--; if (depth === 0) { end = re.lastIndex; break; } }
    }
    if (end < 0) return json(502, { ok: false, error: "About block not closed" }, NO_STORE, request);
    let html = page.slice(start, end);
    html = html
      .replace(/\ssrc="data:image\/svg\+xml;base64,[^"]*"/g, "")
      .replace(/\sdata-src="/g, ' src="')
      .replace(/\sclass="lazyload"/g, "")
      .replace(/\sstyle="--smush[^"]*"/g, "")
      .replace(/\s(src|href)="\/(?!\/)/g, (s, a) => " " + a + '="' + ORIGIN + "/");
    const data = { ok: true, html };
    await cache.put(key, new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "cache-control": "max-age=3600" } }));
    return json(200, data, out, request);
  } catch (err) {
    return jsonError(500, "about page failed", err, request);
  }
}

async function handleHomeExtras(request, env) {
  try {
    const cache = caches.default;
    const key = new Request("https://oo-cache.invalid/home-extras-v2");
    const hit = await cache.match(key);
    if (hit) {
      return json(200, await hit.json(), { "cache-control": "public, max-age=900" }, request);
    }
    const headers = basicAuthHeaders(env) || { "Accept": "text/html" };
    const resp = await fetch(ORIGIN + "/", { headers });
    if (!resp.ok) return json(502, { ok: false, error: "Home page unavailable", status: resp.status }, NO_STORE, request);
    const data = Object.assign({ ok: true }, parseHomeExtras(await resp.text()));
    if (data.sponsors.length || data.columnists.length) {
      await cache.put(key, new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "cache-control": "max-age=900" } }));
    }
    return json(200, data, data.sponsors.length || data.columnists.length ? { "cache-control": "public, max-age=900" } : NO_STORE, request);
  } catch (err) {
    return jsonError(500, "home extras failed", err, request);
  }
}

// Author archives WITHOUT /users or ?author= (the site firewall blocks those for anyone not logged in).
// Method: read ordinary public post lists (not blocked), look at each post's author, and work from that.
// Window: the most recent AUTHOR_SCAN_PAGES x 100 posts, so very old posts by an author may not appear.
// Results are remembered for 15 minutes (Cloudflare cache) so only the first request after that is slow.
async function cachedValue(key, producer) {
  const cache = caches.default;
  const req = new Request("https://oo-cache.invalid/" + key);
  const hit = await cache.match(req);
  if (hit) { try { return await hit.json(); } catch (_) {} }
  const value = await producer();
  if (!Array.isArray(value) || value.length === 0) return value; // never remember an empty answer
  await cache.put(req, new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "cache-control": "max-age=900" } }));
  return value;
}
const AUTHOR_SCAN_PAGES = 10;

async function fetchScanPages(query, env) {
  // Same login the app's author-posts route already uses (the host firewall lets it through).
  const headers = basicAuthHeaders(env) || { "Accept": "application/json" };
  const pages = [];
  for (let p = 1; p <= AUTHOR_SCAN_PAGES; p++) pages.push(p);
  const results = await Promise.all(
    pages.map(async (p) => {
      const u = `${ORIGIN}/wp-json/wp/v2/posts?per_page=100&page=${p}&status=publish&${query}`;
      const resp = await fetch(u, { headers });
      if (!resp.ok) return [];
      const rows = await resp.json().catch(() => []);
      return Array.isArray(rows) ? rows : [];
    })
  );
  return results.flat();
}

// GET /content/authors  ->  { ok, authors: [{ id, name }] }  (authors of the recent posts, A-Z)
async function handleAuthorsList(request, env) {
  try {
    const authors = await cachedValue("authors-v2", async () => {
      const rows = await fetchScanPages("_embed=author&_fields=author,_links,_embedded", env);
      const seen = new Map();
      for (const post of rows) {
        const a = post && post._embedded && Array.isArray(post._embedded.author) ? post._embedded.author[0] : null;
        if (a && a.id && a.name && !seen.has(a.id)) seen.set(a.id, String(a.name));
      }
      return Array.from(seen, ([id, name]) => ({ id, name }));
    });
    return json(200, { ok: true, authors }, authors.length ? { "cache-control": "public, max-age=900" } : NO_STORE, request);
  } catch (err) {
    return jsonError(500, "authors failed", err, request);
  }
}

// GET /content/author-archive?author=ID&page=N&per_page=12
//   -> { ok, posts: [...summary posts with _embedded...], total, total_pages }
async function handleAuthorArchive(request, url, env) {
  try {
    const author = (url.searchParams.get("author") || "").trim();
    const perPage = Math.max(1, Math.min(30, parseInt(url.searchParams.get("per_page") || "12", 10) || 12));
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    if (!author || !/^\d+$/.test(author)) {
      return json(400, { ok: false, error: "Missing or invalid author" }, NO_STORE, request);
    }

    const pairs = await cachedValue("author-pairs-v2", async () => {
      const rows = await fetchScanPages("_fields=id,author", env);
      return rows.map((r) => [r.id, r.author]);
    });
    const ids = pairs.filter((r) => String(r[1]) === author).map((r) => r[0]);
    const total = ids.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const slice = ids.slice((page - 1) * perPage, page * perPage);
    if (!slice.length) {
      return json(200, { ok: true, posts: [], total, total_pages: totalPages }, NO_STORE, request);
    }

    const upstream = new URL(`${ORIGIN}/wp-json/wp/v2/posts`);
    upstream.searchParams.set("include", slice.join(","));
    upstream.searchParams.set("orderby", "include");
    upstream.searchParams.set("per_page", String(slice.length));
    upstream.searchParams.set("_embed", "author,wp:featuredmedia,wp:term");
    // Summary fields only: the post body ("content") is never requested.
    upstream.searchParams.set("_fields", "id,date,link,slug,title,excerpt,author,featured_media,categories,tags,_links,_embedded");
    const resp = await fetch(upstream.toString(), { headers: basicAuthHeaders(env) || { "Accept": "application/json" } });
    if (!resp.ok) {
      return json(resp.status, { ok: false, status: resp.status, error: "Upstream posts request failed" }, NO_STORE, request);
    }
    const posts = await resp.json().catch(() => []);
    return json(200, { ok: true, posts: Array.isArray(posts) ? posts : [], total, total_pages: totalPages }, NO_STORE, request);
  } catch (err) {
    return jsonError(500, "author-archive failed", err, request);
  }
}

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
    path.startsWith("/content/events") ||
    path.startsWith("/content/home-extras") ||
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
