// 🟢 main.js
// 🟢 main.js — start of file
// OkObserver Main JS
// Build 2025-12-08R2-perf2-gridRehydrate (AboutPage & Splash Stable, No Regressions + perf1-scrollDebounce + grid rehydrate)
// NOTE: This file is intentionally written as a single, self-contained script with no imports/exports.
//       It must remain plain JS (no modules) for GitHub Pages compatibility.
//
// File markers for ChatGPT sessions:
// 🟢 main.js — start of file
// 🔴 main.js — end of file
//
// When editing this file in future chats:
// - Always work from the latest user-uploaded version.
// - Never guess or reconstruct from memory.
// - Preserve this header and footer marker comments.
// - Keep the routing/header/grid/service worker logic consistent with the baseline instructions.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Global configuration and flags
  // ---------------------------------------------------------------------------
  const OO_DEBUG_EMBEDS = false;
  const APP_BUILD_TAG = '2025-12-08R6-vimeoPattern';
  const APP_BUILD_LABEL = 'OkObserver Build 2025-12-08R6-vimeoPattern — Splash & About stable; scroll debounce + grid rehydrate + Vimeo fix';

  // Proxy base (must always be used instead of direct WP origin)
  // The app always reads through the Cloudflare Worker. WHICH website the Worker reads (staging now, okobserver.org at launch)
  // is set in worker.js (ORIGIN); the website links in the menu use OO_SITE_ORIGIN in index.html.
  // Local preview only (localhost): until the updated Worker is deployed, read the new staging site directly
  // (add ?src=worker to the address to test through the Worker instead). This never runs on the real app.
  const OO_SITE_ORIGIN = String(window.OO_SITE_ORIGIN || 'https://okobserver.org').replace(/\/+$/, '');
  const OO_LOCAL_DIRECT = location.hostname === 'localhost' && !/[?&]src=worker/.test(location.search);
  const WP_API_BASE = OO_LOCAL_DIRECT
    ? OO_SITE_ORIGIN + '/wp-json/wp/v2'
    : 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

  // Category name(s) that should be filtered out (e.g., cartoons)
  const WORKER_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev';
  const EXCLUDED_CATEGORY_SLUGS = ['cartoon'];

  // Infinite scroll / paging settings
  const POSTS_PER_PAGE = 12;
  const SCROLL_SENTRY_OFFSET = 0; // trigger as soon as sentinel intersects
  const SCROLL_ROOT_MARGIN = '600px 0px';


  // Scroll restoration and routing
  const homeState = {
    scrollY: 0,
    initialized: false
  };

  const searchState = {
    scrollY: 0,
    initialized: false,
    term: ''
  };

  // Last non-login route hash (for “go back to where I was before login”)
  let lastNonLoginHash = '#/';
  let lastListHash = '#/'; // remembers last grid/search page only 
  // Simple in-memory cache for posts (by ID) to avoid refetching
  const postCache = new Map();

  // Deduplicate concurrent post fetches (prefetch + route load for same post)
  const inflightPostFetches = new Map();

  // Perf: remember the last clicked summary post (so detail can render instantly if desired)
  let lastClickedPostSummary = null;



  // Seen IDs for duplicate-guard in infinite scroll
  const seenPostIds = new Set();

  // TTS chunking configuration
  const TTS_CHUNK_SIZE = 600; // characters per chunk
  const TTS_MAX_CHUNKS = 20;  // safety cap

  // Internal flags
  let isFetchingPosts = false;
  let isInitialHomeLoad = true;
  let currentPage = 1;
  let hasMorePages = true;
  let infiniteObserver = null;
  let infiniteScrollLoadTimeout = null;
  // ---------------------------------------------------------------------------
  // Search paging state (added 2025-12-10)
  // ---------------------------------------------------------------------------
  let currentSearchTerm = '';
  let currentSearchPage = 1;
  let hasMoreSearchPages = false;
  let isFetchingSearchResults = false;
  let searchObserver = null;
  let searchScrollLoadTimeout = null;


  // Root app container & loader overlay
  const app = document.getElementById('app');
  const loaderEl = document.getElementById('oo-loader');

  if (!app) {
    console.error('[OkObserver] #app container not found. Aborting.');
    return;
  }

  console.info('[OkObserver] main.js loaded — build tag:', APP_BUILD_TAG);
  window.__OKOBS_MAIN_BUILD__ = APP_BUILD_TAG;

  // Small global to help debugging duplicate-guard behavior
  window.__OKOBS_DUP_GUARD_ENABLED__ = false;

  let ttsAbortController = null;
  let currentTtsPostId = null;
// 🟢 ACTIVE TTS SCROLL STATE
let __okobsTtsActiveText = '';
let __okobsTtsActiveNodes = [];
  // ---------------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------------

  function parseHashRoute() {
    const hash = window.location.hash || '#/';
    if (!hash || hash === '#') return { path: '/', params: {} };

    const raw = hash.substring(1);
    const [path, queryString] = raw.split('?');
    const params = {};

    if (queryString) {
      const usp = new URLSearchParams(queryString);
      for (const [k, v] of usp.entries()) params[k] = v;
    }

    return { path, params };
  }

  function navigateTo(hash) {
    if (window.location.hash === hash) {
      onRouteChange();
    } else {
      window.location.hash = hash;
    }
  }
function updateAuthNav() {
  const signIn = document.getElementById('ooSignInLink');
  const signOut = document.getElementById('ooSignOutLink');

  const loggedIn = (() => {
    try { return localStorage.getItem('ooLoggedIn') === '1'; } catch (_) { return false; }
  })();

  try { document.body.classList.toggle('oo-logged-in', loggedIn); } catch (_) {}

  if (signIn) signIn.style.display = loggedIn ? 'none' : '';
  if (signOut) signOut.style.display = loggedIn ? '' : 'none';
}


  window.addEventListener('hashchange', () => {
    onRouteChange();
  });

  // Back + light/dark pair: top-left under the masthead, above every title, in the same spot on every page except single posts
  function ensureTools() {
    if (!app) return;
    const p = parseHashRoute().path || '/';
    if (p.indexOf('/post/') === 0) return;
    let t = app.querySelector('.oo-tools');
    if (!t) {
      t = document.createElement('div');
      t.className = 'oo-tools';
      app.insertBefore(t, app.firstChild);
    }
    if (!t.querySelector('[data-tool="back"]')) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'oo-tool'; b.setAttribute('data-tool', 'back');
      b.setAttribute('aria-label', 'Back'); b.title = 'Back'; b.innerHTML = '&larr;';
      t.insertBefore(b, t.firstChild);
      b.addEventListener('click', () => { if (window.history.length > 1) window.history.back(); else window.location.hash = '#/'; });
    }
    if (!t.querySelector('[data-tool="theme"]')) {
      const th = document.createElement('button');
      th.type = 'button'; th.className = 'oo-tool'; th.setAttribute('data-tool', 'theme');
      th.setAttribute('aria-label', 'Switch light or dark mode'); th.title = 'Switch light or dark mode'; th.innerHTML = '<i></i>';
      t.appendChild(th);
      th.addEventListener('click', () => {
        const el = document.documentElement;
        const next = el.getAttribute('data-oo-theme') === 'light' ? 'dark' : 'light';
        el.setAttribute('data-oo-theme', next);
        try { localStorage.setItem('ooTheme', next); } catch (err) {}
      });
    }
    t.classList.add('oo-tools-top');
    if (app.firstElementChild !== t) app.insertBefore(t, app.firstChild);
  }
  // Page content starts at the same distance below the pair on every non-post page (the Home page is the reference: 31px to its first line)
  function firstTextTop(t) {
    const w = document.createTreeWalker(app, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const p = n.parentElement;
      if (!p || t.contains(n) || !n.textContent.trim() || /SCRIPT|STYLE/.test(p.tagName)) continue;
      if (p.closest('[hidden]')) continue;
      const cs = getComputedStyle(p);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const g = document.createRange();
      g.selectNodeContents(n);
      const q = g.getClientRects();
      if (q.length && q[0].width > 2 && q[0].height > 2) return q[0].top;
    }
    return null;
  }
  let alignQueued = false;
  function alignContent() {
    alignQueued = false;
    const t = app && app.querySelector('.oo-tools-top');
    if (!t) return;
    t.style.removeProperty('margin-bottom');
    let mb = parseFloat(getComputedStyle(t).marginBottom) || 0;
    for (let k = 0; k < 4; k++) {
      const top = firstTextTop(t);
      if (top === null) return;
      const d = (t.getBoundingClientRect().bottom + 31) - top;
      if (Math.abs(d) < 0.6) return;
      mb = Math.round(mb + d);
      t.style.setProperty('margin-bottom', mb + 'px', 'important');
    }
  }
  function queueAlign() {
    if (alignQueued) return;
    alignQueued = true;
    requestAnimationFrame(alignContent);
    setTimeout(alignContent, 900);
    setTimeout(alignContent, 2600);
  }
  if (app && window.MutationObserver) {
    new MutationObserver(() => { ensureTools(); queueAlign(); }).observe(app, { childList: true, subtree: true });
  }

     function onRouteChange() {
    const { path, params } = parseHashRoute();
// Track last list route for PostDetail "Back to posts"
if (path === '/' || path === '/search' || path === '/toc') {
  lastListHash = window.location.hash || '#/';
}

    console.info('[OkObserver] Route change:', path, params);
    if (app) app.classList.remove('oo-paging');
updateAuthNav();

    // Remember the last non-login hash so we can return after login/logout
// (Don't overwrite it with /login or /logout)
if (path !== '/login' && path !== '/logout') {
  lastNonLoginHash = window.location.hash || '#/';
}


    if (path === '/' || path === '') {
      renderHome();
    } else if (path.startsWith('/post/')) {
      const idStr = path.replace('/post/', '').split('/')[0];
      const id = parseInt(idStr, 10);
      if (!Number.isNaN(id)) {
        renderPostDetail(id);
      } else {
        console.warn('[OkObserver] Invalid post ID in route:', idStr);
        renderNotFound();
      }
    } else if (path === '/page') {
      renderWpPage(params);
    } else if (path === '/about') {
      renderAbout();
    } else if (path === '/search') {
      renderSearch(params);
    } else if (path === '/toc') {
      // Table of Contents was removed from the app; old links go home.
      window.location.replace('#/');
    } else if (path === '/saved' || path === '/following') {
      // Saved and My Feed were retired; old links go home.
      window.location.replace('#/');
    } else if (path === '/events') {
      renderEvents();
    } else if (path === '/browse') {
      renderBrowse(params);
    } else if (path === '/archive') {
      renderArchive(params);
    } else if (path === '/login') {
      // NEW: dedicated login route
      renderLogin();
    } else if (path === '/logout') {
      renderLogout();
    } else {
      renderNotFound();
    }
  }



  // Scroll helpers
  function saveHomeScroll() {
    const y = window.scrollY || window.pageYOffset || 0;
    const { path, params } = parseHashRoute();

    if (path === '/search') {
      // Save scroll for the current search term
      searchState.scrollY = y;
      searchState.initialized = true;
      searchState.term = (params && params.q) || '';
      console.debug(
        '[OkObserver] Saved search scrollY:',
        y,
        'for term:',
        searchState.term
      );
    } else if (path === '/') {
      // Normal home grid
      homeState.scrollY = y;
      homeState.initialized = true;
      console.debug('[OkObserver] Saved home scrollY:', homeState.scrollY);
} else {
  // Intentionally do nothing.
  // Only save scroll state for #/ (home) and #/search.
}

  }

  function restoreSearchScroll(expectedTerm) {
    if (!searchState.initialized) return;
    if (expectedTerm && searchState.term && expectedTerm !== searchState.term) {
      // Different search term → don't restore old scroll
      return;
    }

    const y = searchState.scrollY || 0;
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      console.debug(
        '[OkObserver] Restored search scrollY:',
        y,
        'for term:',
        searchState.term
      );
    });
  }

  function restoreHomeScroll() {
    if (!homeState.initialized) return;
    const y = homeState.scrollY || 0;
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      console.debug('[OkObserver] Restored home scrollY:', y);
    });
  }

  function scrollToTop() {
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
    });
  }

  function hideInitialLoader() {
    if (!loaderEl) return;
    loaderEl.classList.add('oo-loader--hidden');
    setTimeout(() => {
      if (loaderEl && loaderEl.parentNode) {
        loaderEl.parentNode.removeChild(loaderEl);
      }
    }, 400);
  }

  // ---------------------------------------------------------------------------
  // Fetch helpers (all via proxy)
  // ---------------------------------------------------------------------------

async function fetchJson(url, options = {}) {
  console.debug('[OkObserver] fetchJson:', url);

const isAuthCall =
  url.includes('/auth/login') ||
  url.includes('/auth/logout') ||
  url.includes('/auth/status') ||
  options.credentials === 'include';

const shouldSendCreds = isAuthCall || (typeof isClientLoggedIn === 'function' && isClientLoggedIn());


  // Also send the sign-in token as a header: phones that block cross-site cookies still stay signed in.
  let ooAuthHeaders = null;
  try {
    const tok = localStorage.getItem('ooJwt');
    if (tok && shouldSendCreds && !url.includes('/auth/login') && !url.includes('/auth/logout')) {
      ooAuthHeaders = { ...(options.headers || {}), Authorization: 'Bearer ' + tok };
    }
  } catch (_) {}

  const response = await fetch(url, {
    ...options,
    ...(ooAuthHeaders ? { headers: ooAuthHeaders } : {}),
    ...(shouldSendCreds ? { credentials: 'include' } : {})
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}


  async function fetchPostsPage(page) {
    const url = `${WP_API_BASE}/posts?per_page=${POSTS_PER_PAGE}&page=${page}&_embed=author,wp:featuredmedia,wp:term`;

    return fetchJson(url);
  }
  function prefetchPostDetail(postId) {
    try {
      if (!postId) return;

      // Don't block UI—just warm cache in the background.
      fetchPostById(postId).catch(() => {});
    } catch (_) {}
  }

async function fetchPostById(id) {
  const isLoggedIn = isClientLoggedIn();
  console.debug('[OkObserver auth] fetchPostById:', {
    id,
    isLoggedIn,
    ooLoggedIn: (() => { try { return localStorage.getItem('ooLoggedIn'); } catch(e){ return 'ERR'; } })(),
    oo_logged_in: (() => { try { return localStorage.getItem('oo_logged_in'); } catch(e){ return 'ERR'; } })()
  });

  if (postCache.has(id)) {
    const cached = postCache.get(id);
    const cachedAuth = !!(cached && cached._ooAuth);

    // If login state changed since this post was cached, refetch.
    if (cachedAuth === isLoggedIn) {
      return cached;
    }
  }

  // Deduplicate concurrent fetches for the same post ID + auth state.
  const inflight = inflightPostFetches.get(id);
  if (inflight && inflight.auth === isLoggedIn) {
    return inflight.promise;
  }

  const fetchPromise = (async () => {
    // Use the Worker full-post endpoint for both signed-out and logged-in users.
    let data;

    const fullUrlObj = new URL(WP_API_BASE);
    fullUrlObj.pathname = '/content/full-post';
    fullUrlObj.search = `?id=${encodeURIComponent(id)}`;

    console.debug('[OkObserver auth] fetchPostById fullUrl:', fullUrlObj.toString());

    const fullResp = await fetchJson(
      fullUrlObj.toString(),
      isLoggedIn ? { credentials: 'include' } : {}
    );

    // 🟢 Protected-content response from Worker
    if (fullResp && fullResp.protected === true) {
      const protectedPost = (fullResp && fullResp.post) ? fullResp.post : {
        id,
        title: { rendered: 'Members Only' },
        date: '',
        excerpt: { rendered: fullResp.excerpt || '' },
        content: { rendered: '' },
        _embedded: {}
      };

      protectedPost._ooProtected = true;
      protectedPost._ooProtectedMessage =
        fullResp.message || 'This content is for members only';

      // Ensure logged-out users see a warning + login link, not just a blank/teaser body.
      const protectedExcerptHtml =
        protectedPost.excerpt && typeof protectedPost.excerpt.rendered === 'string'
          ? protectedPost.excerpt.rendered
          : '';

      protectedPost.content = {
        rendered: `
          <div class="oo-paywall-notice">
            <p><strong>${protectedPost._ooProtectedMessage}</strong></p>
            <p><a href="#/login" class="oo-inline-login">Log in</a> to read the full article.</p>
          </div>
          ${protectedExcerptHtml}
        `
      };

      try { protectedPost._ooAuth = !!isLoggedIn; } catch (_) {}

      postCache.set(id, protectedPost);
      return protectedPost;
    }

    // Worker returns { ok:true, post:{...} } — fall back if structure differs.
    data = (fullResp && fullResp.post) ? fullResp.post : fullResp;

    // Logged-out teaser detection:
    // if the returned body is effectively just the excerpt (or empty), treat it as protected
    // so the UI shows a clear members-only/login warning.
    if (!isLoggedIn && data) {
      const excerptHtml =
        data.excerpt && typeof data.excerpt.rendered === 'string'
          ? data.excerpt.rendered
          : '';

      const contentHtml =
        data.content && typeof data.content.rendered === 'string'
          ? data.content.rendered
          : '';

      const strippedExcerpt = stripHtml(excerptHtml).replace(/\s+/g, ' ').trim();
      const strippedContent = stripHtml(contentHtml).replace(/\s+/g, ' ').trim();

      const contentLooksLikeExcerptOnly =
        !!strippedExcerpt &&
        (
          !strippedContent ||
          strippedContent === strippedExcerpt ||
          strippedContent.startsWith(strippedExcerpt)
        );

      if (contentLooksLikeExcerptOnly) {
        data._ooProtected = true;
        data._ooProtectedMessage = 'This content is for members only';
        data.content = {
          rendered: `
            <div class="oo-paywall-notice">
              <p><strong>${data._ooProtectedMessage}</strong></p>
              <p><a href="#/login" class="oo-inline-login">Log in</a> to read the full article.</p>
            </div>
            ${excerptHtml}
          `
        };
      }
    }

    // Mark what auth state produced this cached payload.
    try { data._ooAuth = !!isLoggedIn; } catch (_) {}

    postCache.set(id, data);
    return data;
  })();

  inflightPostFetches.set(id, {
    auth: isLoggedIn,
    promise: fetchPromise
  });

  try {
    return await fetchPromise;
  } finally {
    const current = inflightPostFetches.get(id);
    if (current && current.promise === fetchPromise) {
      inflightPostFetches.delete(id);
    }
  }
}

  async function fetchSearchResults(term, page = 1) {
    const enc = encodeURIComponent(term || '');
    const url =
  `${WP_API_BASE}/posts?search=${enc}&per_page=${POSTS_PER_PAGE}&page=${page}&_embed=author,wp:featuredmedia,wp:term`;

    return fetchJson(url);
  }


  // Cached About page (contact-about-donate) so we only fetch once
  let aboutPageCache = null;

  async function fetchAboutPage() {
    if (aboutPageCache) return aboutPageCache;

    let page = null;
    for (const slug of ['about', 'contact-about-donate']) {
      const pages = await fetchJson(`${WP_API_BASE}/pages?slug=${slug}&_embed`);
      page = Array.isArray(pages) && pages.length ? pages[0] : null;
      if (page) break;
    }

    aboutPageCache = page;
    return page;
  }

  // ---------------------------------------------------------------------------
  // Content helpers
  // ---------------------------------------------------------------------------

  function extractCategories(post) {
  if (post._embedded && Array.isArray(post._embedded['wp:term'])) {
    for (const termGroup of post._embedded['wp:term']) {
      if (Array.isArray(termGroup)) {
        for (const term of termGroup) {
          if (term && term.taxonomy === 'category') {
            return termGroup.filter(t => t && t.taxonomy === 'category');
          }
        }
      }
    }
  }
  return [];
}

function extractTags(post) {
  if (post._embedded && Array.isArray(post._embedded['wp:term'])) {
    for (const termGroup of post._embedded['wp:term']) {
      if (Array.isArray(termGroup)) {
        for (const term of termGroup) {
          if (term && term.taxonomy === 'post_tag') {
            return termGroup.filter(t => t && t.taxonomy === 'post_tag');
          }
        }
      }
    }
  }
  return [];
}



  function hasExcludedCategory(post) {
    const cats = extractCategories(post);
    if (!cats || !cats.length) return false;
    return cats.some(cat => {
      if (!cat || !cat.slug) return false;
      return EXCLUDED_CATEGORY_SLUGS.includes(cat.slug.toLowerCase());
    });
  }

  function getFeaturedMedia(post) {
    if (!post || !post._embedded) return null;
    const media = post._embedded['wp:featuredmedia'];
    if (Array.isArray(media) && media.length > 0) {
      return media[0];
    }
    return null;
  }

  function getFeaturedImageUrl(post) {
    const media = getFeaturedMedia(post);
    if (!media) return null;

    if (media.media_details && media.media_details.sizes) {
      const sizes = media.media_details.sizes;
      if (sizes.medium_large && sizes.medium_large.source_url) {
        return sizes.medium_large.source_url;
      }
      if (sizes.large && sizes.large.source_url) {
        return sizes.large.source_url;
      }
    }

    return media.source_url || null;
  }
function getFirstLinkedImageHrefFromContent(post) {
  try {
    const html = post && post.content && post.content.rendered ? post.content.rendered : "";
    if (!html) return "";

    // Find: <a href="..."><img ...></a> (first occurrence)
    const m = html.match(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>\s*<img\b[^>]*>/i);
    if (!m || !m[1]) return "";

    // Make relative links absolute (WP site base)
    const href = m[1].trim();
    try {
      return new URL(href, (window.OO_SITE_ORIGIN || "https://okobserver.org") + "/").toString();
    } catch (_) {
      return href;
    }
  } catch (_) {
    return "";
  }
}
function extractHeroLinkFromContent(post) {
  const html = post && post.content && post.content.rendered
    ? post.content.rendered
    : '';

  if (!html) return null;

  // ONLY accept: <a href="..."><img ...></a>
  const m = html.match(
    /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>\s*<img\b[^>]*>/i
  );

  return (m && m[1]) ? m[1] : null;
}



  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function getAuthorName(post) {
    if (!post || !post._embedded) return '';
    const authors = post._embedded.author;
    if (Array.isArray(authors) && authors.length > 0 && authors[0] && authors[0].name) {
      return authors[0].name;
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // TTS helpers
  // ---------------------------------------------------------------------------

  function splitTextIntoChunks(text, chunkSize) {
    const chunks = [];
    let remaining = text || '';
    let safetyCounter = 0;

    while (remaining.length > 0 && safetyCounter < TTS_MAX_CHUNKS) {
      let idx = remaining.lastIndexOf('.', chunkSize);
      if (idx === -1) idx = remaining.lastIndexOf(' ', chunkSize);
      if (idx === -1 || idx < chunkSize * 0.5) {
        idx = Math.min(chunkSize, remaining.length);
      } else {
        idx += 1;
      }
      const part = remaining.slice(0, idx).trim();
      if (part) chunks.push(part);
      remaining = remaining.slice(idx);
      safetyCounter++;
    }

    if (remaining.trim()) {
      chunks.push(remaining.trim());
    }

    return chunks;
  }

  function stopTtsPlayback(options = {}) {
    const shouldStopNative = options.native !== false;

    if (ttsAbortController) {
      ttsAbortController.abort();
      ttsAbortController = null;
    }

    if (shouldStopNative && window.AndroidTTS && typeof window.AndroidTTS.stop === 'function') {
      try {
        window.AndroidTTS.stop();
      } catch (err) {
        console.error('[OkObserver TTS] Android stop bridge error:', err);
      }
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    currentTtsPostId = null;
    __okobsTtsActiveText = '';
    __okobsTtsActiveNodes = [];
    __okobsTtsPaused = false;
    __okobsTtsPos = 0;
    hideListenBox();

    const container = app.querySelector('.post-detail-content');
    if (container) {
      container.querySelectorAll('.oo-tts-active-block').forEach((el) => {
        el.classList.remove('oo-tts-active-block');
      });
    }
  }
  window.__okobsTtsRange = function(start, end) {
    try {
      if (typeof start === 'number') __okobsTtsPos = start + (__okobsTtsBase || 0);
      const container = app.querySelector('.post-detail-content');
      if (!container) return;

      const blocks = __okobsTtsBlocks(container);
      if (!blocks.length) return;

      let runningStart = 0;
      let activeBlock = null;

      for (const block of blocks) {
        const rawText = (block.textContent || '').replace(/\bhttps?:\/\/[^\s]+/gi, '').replace(/\s+/g, ' ').trim();
        if (!rawText) continue;

        const blockStart = runningStart;
        const blockEnd = runningStart + rawText.length + 1;

        if (start >= blockStart && start < blockEnd) {
          activeBlock = block;
          break;
        }

        runningStart = blockEnd;
      }

      if (!activeBlock) return;


    } catch (err) {
      console.error('[OkObserver TTS] __okobsTtsRange error:', err);
    }
  };

  window.__okobsTtsDone = function() {
    try {
      if (__okobsTtsPaused) return;
      hideListenBox();
      ttsAbortController = null;
      currentTtsPostId = null;
      __okobsTtsActiveText = '';
      __okobsTtsActiveNodes = [];


    } catch (err) {
      console.error('[OkObserver TTS] __okobsTtsDone error:', err);
    }
  };
  async function speakChunksSequentially(text, postId) {
  stopTtsPlayback({ native: false });

  const chunks = splitTextIntoChunks(text, TTS_CHUNK_SIZE);
  if (!chunks.length) return;

  const localAbort = new AbortController();
  ttsAbortController = localAbort;
  currentTtsPostId = postId || null;

    // Android app bridge: use native TTS when available.
if (window.AndroidTTS && typeof window.AndroidTTS.speak === 'function') {
  try {
    __okobsTtsActiveText = text || '';
    currentTtsPostId = postId || null;

    window.AndroidTTS.speak(text);
  } catch (err) {
    console.error('[OkObserver TTS] Android bridge error:', err);
    alert('Text-to-speech failed in the Android app.');
    if (ttsAbortController === localAbort) {
      ttsAbortController = null;
      currentTtsPostId = null;
      __okobsTtsActiveText = '';
      __okobsTtsActiveNodes = [];
    }
  }
  return;
}
    if (!window.speechSynthesis) {
      alert('Text-to-speech is not supported in this browser.');
      ttsAbortController = null;
      currentTtsPostId = null;
    __okobsTtsActiveText = '';
    __okobsTtsActiveNodes = [];

 
      return;
    }

    console.log('[OkObserver TTS] Speaking', chunks.length, 'chunks');

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (localAbort.signal.aborted) break;

        const utter = new SpeechSynthesisUtterance(chunks[i]);
        utter.rate = 1.0;
        utter.pitch = 1.0;
        utter.volume = 1.0;

        await new Promise((resolve, reject) => {
          utter.onend = () => resolve();
          utter.onerror = (e) => reject(e.error || e);
          window.speechSynthesis.speak(utter);
        });
      }
    } catch (err) {
      if (!localAbort.signal.aborted) {
        console.error('[OkObserver TTS] Error while speaking chunks:', err);
      }
    } finally {
      if (ttsAbortController === localAbort) {
        ttsAbortController = null;
        currentTtsPostId = null;
        hideListenBox();
      }
    }
  }

  // ---- Playback box (matches the website Listen box): play/pause, closes when you tap elsewhere ----
  let __okobsTtsPaused = false;
  let __okobsTtsPos = 0;
  let __okobsTtsBase = 0;
  function hideListenBox() {
    const old = document.querySelector('.oo-listen-box');
    if (old) old.remove();
  }
  function showListenBox() {
    hideListenBox();
    __okobsTtsPaused = false;
    const row = app.querySelector('.post-detail-tts-row');
    if (!row) return;
    const box = document.createElement('div');
    box.className = 'oo-listen-box';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Reading aloud');
    box.innerHTML = '<button type="button" class="oo-lb-pp" aria-label="Pause">&#10074;&#10074;</button><span class="oo-lb-txt">Reading aloud</span><button type="button" class="oo-lb-x" aria-label="Stop and close">&times;</button>';
    row.appendChild(box);
    const pp = box.querySelector('.oo-lb-pp');
    const txt = box.querySelector('.oo-lb-txt');
    pp.addEventListener('click', () => {
      const native = window.AndroidTTS && typeof window.AndroidTTS.speak === 'function';
      if (!__okobsTtsPaused) {
        __okobsTtsPaused = true;
        if (native) { try { window.AndroidTTS.stop(); } catch (err) {} }
        else if (window.speechSynthesis) window.speechSynthesis.pause();
        pp.innerHTML = '&#9654;'; pp.setAttribute('aria-label', 'Play'); txt.textContent = 'Paused';
      } else {
        __okobsTtsPaused = false;
        if (native) {
          const full = __okobsTtsActiveText || '';
          let from = Math.max(0, Math.min(__okobsTtsPos || 0, full.length - 1));
          const dot = full.lastIndexOf('. ', from);
          from = dot >= 0 ? dot + 2 : 0;
          __okobsTtsBase = from;
          try { window.AndroidTTS.speak(full.slice(from)); } catch (err) {}
        } else if (window.speechSynthesis) window.speechSynthesis.resume();
        pp.innerHTML = '&#10074;&#10074;'; pp.setAttribute('aria-label', 'Pause'); txt.textContent = 'Reading aloud';
      }
    });
    box.querySelector('.oo-lb-x').addEventListener('click', () => stopTtsPlayback({ native: true }));
  }

function __okobsTtsBlocks(root) {
  // Innermost text blocks, so posts built from <div>s (pasted from Facebook) are read in full, nothing twice.
  const inner = 'p, h1, h2, h3, h4, h5, h6, li, div, ul, ol, blockquote, table';
  return Array.from(root.querySelectorAll('p, h1, h2, h3, h4, li, div, blockquote')).filter((el) => !el.querySelector(inner));
}

function buildTtsTextFromHtml(html) {
  if (!html) return '';

  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  const blocks = __okobsTtsBlocks(tmp);

  __okobsTtsActiveNodes = [];
  __okobsTtsActiveText = '';

  let combined = '';

  blocks.forEach((el) => {
    const text = (el.textContent || '').replace(/\bhttps?:\/\/[^\s]+/gi, '').trim();
    if (!text) return;

    const start = combined.length;
    combined += text + ' ';
    const end = combined.length;

    __okobsTtsActiveNodes.push({
      start,
      end,
      text
    });
  });

  __okobsTtsActiveText = combined.replace(/\s+/g, ' ').trim();

  if (!__okobsTtsActiveText) {
    const fallbackText = (tmp.textContent || tmp.innerText || '')
      .replace(/\bhttps?:\/\/[^\s]+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    __okobsTtsActiveText = fallbackText;
  }

  return __okobsTtsActiveText;
}

  // ---------------------------------------------------------------------------
  // Card creation (home/search grid)
  // ---------------------------------------------------------------------------

  function createPostCard(post) {
    const card = document.createElement('article');
    card.className = 'post-card';

    const imageUrl = getFeaturedImageUrl(post);
    if (imageUrl) {
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'post-card-image-wrapper';

      const img = document.createElement('img');
      img.className = 'post-card-image';
      img.src = `${imageUrl}?cb=${post.id}`;
      img.alt = (post && post.title && post.title.rendered) ? stripHtml(post.title.rendered) : 'Post image';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.fetchPriority = 'low';


      imgWrapper.appendChild(img);
      card.appendChild(imgWrapper);
    }

    // Warm the article when a finger rests on the card (not while scrolling past it)
    let warmTimer = null;
    card.addEventListener('touchstart', () => { clearTimeout(warmTimer); warmTimer = setTimeout(() => prefetchPostDetail(post.id), 140); }, { passive: true });
    card.addEventListener('touchmove', () => clearTimeout(warmTimer), { passive: true });
    card.addEventListener('touchend', () => clearTimeout(warmTimer), { passive: true });

    const content = document.createElement('div');
    content.className = 'post-card-content';

    const titleEl = document.createElement('h2');
    titleEl.className = 'post-card-title';

    const titleLink = document.createElement('a');
    titleLink.href = `#/post/${post.id}`;
    titleLink.className = 'post-card-title-link';
    titleLink.innerHTML = post.title && post.title.rendered ? post.title.rendered : '(Untitled)';

    titleEl.appendChild(titleLink);

    const meta = document.createElement('div');
    meta.className = 'post-card-meta';
    const dateStr = formatDate(post.date);
    const authorName = getAuthorName(post);
    // like the website: author, then a lighter long-form date ("November 8, 2026")
    let longDate = '';
    try { const dd = new Date(post.date); if (!Number.isNaN(dd.getTime())) longDate = dd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { /* keep short date */ }
    const shownDate = longDate || dateStr;
    meta.innerHTML = (authorName ? '<span class="oo-m-by">' + escapeHtml(authorName) + '</span>' : '') +
      (authorName && shownDate ? '<span class="oo-m-sep"> - </span>' : '') +
      (shownDate ? '<span class="oo-m-date">' + escapeHtml(shownDate) + '</span>' : '');

    const excerptEl = document.createElement('div');
    excerptEl.className = 'post-card-excerpt';
    excerptEl.innerHTML = cleanExcerptForLoggedIn(
  post.excerpt && post.excerpt.rendered ? post.excerpt.rendered : '' );

    content.appendChild(titleEl);
    content.appendChild(meta);
    content.appendChild(excerptEl);

    card.appendChild(content);

    card.addEventListener('click', (evt) => {
      if (evt.target && evt.target.closest && evt.target.closest('.post-card-save')) return;
      const clickedLink = (evt.target && evt.target.closest) ? evt.target.closest('a') : null;
if (clickedLink && !clickedLink.classList.contains('post-card-title-link')) {
  // If WP injected the paywall login redirect link, keep the user inside the SPA.
  const href = (clickedLink.getAttribute('href') || '').trim();

  if (
    href &&
    href.includes('my-account') &&
    href.includes('wcm_redirect_to=post')
  ) {
    evt.preventDefault();
    evt.stopPropagation();
    navigateTo('#/login');
    return;
  }

  // Otherwise, let links inside the excerpt behave like normal links.
  return;
}

      evt.preventDefault();
      saveHomeScroll();
// Option A: remember the clicked summary post so we can render detail shell immediately
      lastClickedPostSummary = post;
      prefetchPostDetail(post.id);
      navigateTo(`#/post/${post.id}`);
    });

    return card;
  }

        async function appendCardsInChunks(grid, cards, chunkSize = 4) {
    if (!grid || !Array.isArray(cards) || !cards.length) return;

    let index = 0;

    while (index < cards.length) {
      const frag = document.createDocumentFragment();
      const end = Math.min(index + chunkSize, cards.length);

      for (; index < end; index++) {
        frag.appendChild(cards[index]);
      }

      grid.appendChild(frag);

      if (index < cards.length) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
  }

  async function buildPostCardsInChunks(posts, chunkSize = 4) {
    if (!Array.isArray(posts) || !posts.length) return [];

    const builtCards = [];
    let index = 0;

    while (index < posts.length) {
      const end = Math.min(index + chunkSize, posts.length);

      for (; index < end; index++) {
        builtCards.push(createPostCard(posts[index]));
      }

      if (index < posts.length) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }

    return builtCards;
  }



  function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').trim();
  }
  // Logged-in excerpt cleanup: remove paywall boilerplate from excerpts only
function isClientLoggedIn() {
  try {
    return (
      localStorage.getItem('ooLoggedIn') === '1' ||
      localStorage.getItem('oo_logged_in') === '1' ||      // legacy restore key (if any)
      localStorage.getItem('ooLoggedIn') === 'true'        // defensive
    );
  } catch (_) {
    return false;
  }
}


function cleanExcerptForLoggedIn(excerptHtml) {
  if (!excerptHtml) return '';
  if (!isClientLoggedIn()) return excerptHtml;

  const tmp = document.createElement('div');
  tmp.innerHTML = excerptHtml;
  // PERF: prevent heavy media from loading in grid/search excerpts
  // Keep excerpts text-only (media belongs on the post detail page).
  tmp.querySelectorAll('img, picture, source, video, iframe, figure').forEach((el) => el.remove());


  // Remove common paywall/login boilerplate (client-side only)
  const killPhrases = [
    'you must log in',
    'purchase',
    'subscription',
    'sign in',
    'log in to continue'
  ];

  // Remove paragraphs/divs that are basically just the boilerplate message
  tmp.querySelectorAll('p, div').forEach((el) => {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!t) return;
    if (killPhrases.some(p => t.includes(p))) el.remove();
  });

  const cleaned = tmp.innerHTML.trim();
  return cleaned || '';
}

  // ---------------------------------------------------------------------------
  // Home view
  // ---------------------------------------------------------------------------

  // Home: the newest post becomes the big "Latest News" lead card, like the website.
  function promoteLead(grid) {
    const lead = app.querySelector('[data-oo="lead"]');
    if (!lead || lead.firstElementChild || !grid || !grid.firstElementChild) return;
    lead.appendChild(grid.firstElementChild);
    // The lead photo is what people see first: load it right away, at high priority.
    const leadImg = lead.querySelector('img.post-card-image');
    if (leadImg) { leadImg.loading = 'eager'; leadImg.fetchPriority = 'high'; }
  }

  // Home: "National Columnists" row (posts in the Columnists category), fetched once.
  let columnistPosts = null;
  async function loadColumnists() {
    const section = app.querySelector('[data-oo="columnists"]');
    const row = app.querySelector('[data-oo="col-row"]');
    if (!section || !row) return;
    try {
      if (!columnistPosts) {
        // Instant: show the row from the last visit while fresh posts load.
        const snap = LS.get('ooColSnap:' + SITE_KEY, null);
        let paintedFromSnap = false;
        if (snap && Array.isArray(snap.posts) && snap.posts.length && document.body.contains(row)) {
          row.innerHTML = '';
          snap.posts.forEach((p) => row.appendChild(createPostCard(p)));
          section.hidden = false;
          paintedFromSnap = true;
        }
        let id = LS.get('ooColCat:' + SITE_KEY, 0);
        if (!id) {
          const cats = await fetchJson(`${WP_API_BASE}/categories?slug=columnists&_fields=id`);
          id = Array.isArray(cats) && cats.length ? cats[0].id : null;
          if (!id) return;
          LS.set('ooColCat:' + SITE_KEY, id);
        }
        const posts = await fetchJson(`${WP_API_BASE}/posts?categories=${id}&per_page=6&_embed=author,wp:featuredmedia,wp:term`);
        columnistPosts = (Array.isArray(posts) ? posts : []).filter((p) => !hasExcludedCategory(p)).slice(0, 4);
        columnistPosts.forEach((p) => postCache.set(p.id, p));
        LS.set('ooColSnap:' + SITE_KEY, { posts: columnistPosts.map(compactPost) });
      }
      if (!columnistPosts.length || !document.body.contains(row)) return;
      row.innerHTML = '';
      columnistPosts.forEach((p) => row.appendChild(createPostCard(p)));
      section.hidden = false;
    } catch (err) {
      console.warn('[OkObserver] Columnists row unavailable:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Home, in the website's order: Latest News, National Columnists, The Magazine, ObserverCast,
  // Newsmakers, Featured Cartoon, Advertisers, Shop the Observer, Featured Columnists.
  // Every post section is a swipe row (snaps into place, arrows underneath like the website).
  // ---------------------------------------------------------------------------
  let homeData = Object.create(null);   // this visit's section data (cleared by pull-to-refresh)
  let homePos = Object.create(null);    // each row's sideways position, so coming back from a story keeps your place
  let homeTimer = null;                 // sponsor rotation
  const HOME_SLUGS = ['substack', 'columnists', 'issues', 'observercast', 'newsmakers', 'cartoon'];
  const ARROW_L = '<svg viewBox="0 0 28 12" width="28" height="12" aria-hidden="true"><path d="M27 6H2M6 1.5 1.5 6 6 10.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ARROW_R = '<svg viewBox="0 0 28 12" width="28" height="12" aria-hidden="true"><path d="M1 6h25M22 1.5 26.5 6 22 10.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  async function homeCatIds() {
    let ids = LS.get('ooHomeCats:' + SITE_KEY, null);
    if (ids && ids.columnists) return ids;
    const rows = await fetchJson(`${WP_API_BASE}/categories?slug=${HOME_SLUGS.join(',')}&per_page=20&_fields=id,slug`);
    ids = {};
    (Array.isArray(rows) ? rows : []).forEach((c) => { if (c && c.slug) ids[c.slug] = c.id; });
    if (Object.keys(ids).length) LS.set('ooHomeCats:' + SITE_KEY, ids);
    return ids;
  }

  async function homeSectionPosts(key, slug, perPage) {
    if (homeData[key]) return homeData[key];
    const ids = await homeCatIds();
    const id = ids[slug];
    if (!id && key !== 'latest') return [];
    const rows = await fetchJson(`${WP_API_BASE}/posts?${id ? 'categories=' + id + '&' : ''}per_page=${perPage}&_embed=author,wp:featuredmedia,wp:term`);
    const posts = (Array.isArray(rows) ? rows : []).filter((p) => key !== 'columnists' || !hasExcludedCategory(p));
    posts.forEach((p) => { postCache.set(p.id, p); seenPostIds.add(p.id); });
    homeData[key] = posts;
    LS.set('ooHomeSec:' + SITE_KEY + ':' + key, posts.map(compactPost));
    return posts;
  }

  function homeSectionEl(key, title, extraClass, slug) {
    const sec = document.createElement('section');
    sec.className = 'oo-home-sec oo-sec-' + key + (extraClass ? ' ' + extraClass : '');
    sec.setAttribute('data-oo-sec', key);
    const titleHtml = slug ? `<a class="oo-section-link" href="#/archive?type=category&slug=${encodeURIComponent(slug)}&label=${encodeURIComponent(title)}"><span>${escapeHtml(title)}</span></a>` : escapeHtml(title);
    sec.innerHTML = `<h2 class="oo-section-title">${titleHtml}</h2><div class="oo-snapwrap"><div class="oo-snap" data-oo="track"></div></div>`;
    const track = sec.querySelector('.oo-snap');
    // side arrows beside the cards (Latest News + National Columnists), like the website
    let sidePrev = null, sideNext = null;
    if (['latest', 'columnists', 'magazine', 'observercast', 'newsmakers', 'cartoon'].indexOf(key) !== -1) {
      const chev = (d) => '<svg viewBox="0 0 14 26" width="14" height="26" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      sidePrev = document.createElement('button'); sidePrev.type = 'button'; sidePrev.className = 'oo-side oo-side-prev'; sidePrev.setAttribute('aria-label', 'Previous'); sidePrev.innerHTML = chev('M11 2 3 13l8 11');
      sideNext = document.createElement('button'); sideNext.type = 'button'; sideNext.className = 'oo-side oo-side-next'; sideNext.setAttribute('aria-label', 'Next'); sideNext.innerHTML = chev('M3 2l8 11-8 11');
      const wrap = sec.querySelector('.oo-snapwrap'); wrap.appendChild(sidePrev); wrap.appendChild(sideNext);
      sidePrev.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' }));
      sideNext.addEventListener('click', () => track.scrollBy({ left: track.clientWidth, behavior: 'smooth' }));
    }
    const update = () => {
      const max = track.scrollWidth - track.clientWidth - 2;
      if (sidePrev) { sidePrev.hidden = max <= 2; sideNext.hidden = max <= 2; sidePrev.classList.toggle('is-dim', track.scrollLeft <= 2); sideNext.classList.toggle('is-dim', track.scrollLeft >= max); }
    };
    track.addEventListener('scroll', () => { homePos[key] = track.scrollLeft; requestAnimationFrame(update); }, { passive: true });
    sec._update = () => {
      track.scrollLeft = homePos[key] || 0;
      update();
      // pictures change a row's width after they load
      track.querySelectorAll('img').forEach((im) => { if (!im.complete) im.addEventListener('load', update, { once: true }); });
    };
    return sec;
  }

  function seeAllSlide(slug, label) {
    const a = document.createElement('a');
    a.className = 'oo-seeall';
    a.href = `#/archive?type=category&slug=${encodeURIComponent(slug)}&label=${encodeURIComponent(label)}`;
    a.innerHTML = `<span>See all</span><span class="oo-seeall-sub">${escapeHtml(label)}</span>${ARROW_R}`;
    return a;
  }

  function fillHomeSection(sec, key, posts) {
    const track = sec.querySelector('.oo-snap');
    track.innerHTML = '';
    if (!posts.length) { sec.hidden = true; return; }
    sec.hidden = false;
    if (key === 'latest') {
      for (let i = 0; i < posts.length; i += 3) {
        const slide = document.createElement('div');
        slide.className = 'oo-slide';
        const lead = document.createElement('div');
        lead.className = 'oo-lead';
        lead.appendChild(createPostCard(posts[i]));
        slide.appendChild(lead);
        const pair = document.createElement('div');
        pair.className = 'oo-pair';
        posts.slice(i + 1, i + 3).forEach((p) => pair.appendChild(createPostCard(p)));
        if (pair.children.length) slide.appendChild(pair);
        track.appendChild(slide);
      }
      const first = track.querySelector('.oo-lead img.post-card-image');
      if (first) { first.loading = 'eager'; first.fetchPriority = 'high'; }
      const end = document.createElement('div'); end.className = 'oo-slide oo-slide-end'; end.appendChild(seeAllSlide('substack', 'Latest News')); track.appendChild(end);
      posts.forEach((p) => seenPostIds.add(p.id));
    } else if (key === 'columnists') {
      posts.forEach((p) => { const w = document.createElement('div'); w.className = 'oo-item'; w.appendChild(createPostCard(p)); track.appendChild(w); });
      const end = document.createElement('div'); end.className = 'oo-item oo-item-end'; end.appendChild(seeAllSlide('columnists', 'National Columnists')); track.appendChild(end);
    } else if (key === 'magazine') {
      posts.forEach((p) => {
        const img = getFeaturedImageUrl(p);
        const a = document.createElement('a');
        a.className = 'oo-item oo-cover';
        a.href = `#/post/${p.id}`;
        a.innerHTML = `${img ? `<img src="${escapeAttr(img)}" alt="" loading="lazy" decoding="async" />` : ''}<span>${escapeHtml(stripHtml((p.title && p.title.rendered) || ''))}</span>`;
        track.appendChild(a);
      });
      const end = document.createElement('div'); end.className = 'oo-item oo-item-end'; end.appendChild(seeAllSlide('issues', 'The Magazine')); track.appendChild(end);
    } else if (key === 'observercast' || key === 'newsmakers') {
      posts.forEach((p) => { const w = document.createElement('div'); w.className = 'oo-slide oo-lead oo-wide'; w.appendChild(createPostCard(p)); track.appendChild(w); });
      const end = document.createElement('div'); end.className = 'oo-slide oo-slide-end'; end.appendChild(seeAllSlide(key, key === 'observercast' ? 'ObserverCast' : 'Newsmakers')); track.appendChild(end);
    } else if (key === 'cartoon') {
      posts.forEach((p) => {
        const img = getFeaturedImageUrl(p);
        if (!img) return;
        const a = document.createElement('a');
        a.className = 'oo-slide oo-cartoon';
        a.href = `#/post/${p.id}`;
        a.innerHTML = `<img src="${escapeAttr(img)}" alt="${escapeAttr(stripHtml((p.title && p.title.rendered) || 'Cartoon'))}" loading="lazy" decoding="async" /><span>${escapeHtml(stripHtml((p.title && p.title.rendered) || ''))}</span>`;
        track.appendChild(a);
      });
      const end = document.createElement('div'); end.className = 'oo-slide oo-slide-end'; end.appendChild(seeAllSlide('cartoon', 'Cartoons')); track.appendChild(end);
    }
    sec._update();
  }

  async function loadHomeSection(sec, key, slug, perPage) {
    // Instant: last visit's copy while fresh posts load.
    let painted = false;
    const snap = homeData[key] ? null : LS.get('ooHomeSec:' + SITE_KEY + ':' + key, null);
    if (snap && Array.isArray(snap) && snap.length) { fillHomeSection(sec, key, snap); painted = true; }
    try {
      const fresh = await homeSectionPosts(key, slug, perPage);
      if (!document.body.contains(sec)) return;
      const same = painted && snap.length === fresh.length && snap.every((p, i) => p.id === fresh[i].id);
      if (!same) fillHomeSection(sec, key, fresh);
      if (key === 'latest') hideInitialLoader();
    } catch (err) {
      console.warn('[OkObserver] Home section failed:', key, err);
      if (key === 'latest') {
        hideInitialLoader();
        if (!painted) sec.querySelector('.oo-snap').innerHTML = '<p class="oo-home-error">Couldn’t load the news. Pull down to try again.</p>';
      } else if (!painted) sec.hidden = true;
    }
  }

  async function loadHomeExtras() {
    if (homeData.extras) return homeData.extras;
    const cached = LS.get('ooHomeExtras:' + SITE_KEY, null);
    if (cached && !homeData.extrasTried) { homeData.extrasTried = true; homeData.extras = cached; }
    try {
      const res = await fetch(`${WORKER_BASE}/content/home-extras`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.ok) { homeData.extras = data; LS.set('ooHomeExtras:' + SITE_KEY, data); }
    } catch (err) { console.warn('[OkObserver] Home extras unavailable:', err); }
    return homeData.extras || null;
  }

  function buildSponsors(sec, sponsors) {
    const track = sec.querySelector('.oo-snap');
    track.innerHTML = '';
    sponsors.forEach((s) => {
      const a = document.createElement('a');
      a.className = 'oo-slide oo-sponsor';
      a.href = s.href || '#';
      a.target = '_blank'; a.rel = 'noopener sponsored';
      a.setAttribute('aria-label', s.name || 'Sponsor');
      a.innerHTML = `<img src="${escapeAttr(s.img)}" alt="${escapeAttr(s.name || 'Sponsor')}" loading="lazy" decoding="async" />`;
      track.appendChild(a);
    });
    const cta = sec.querySelector('.oo-advertise');
    if (!cta) {
      const b = document.createElement('a');
      b.className = 'oo-advertise';
      b.href = 'mailto:admin@okobserver.org';
      b.textContent = 'Advertise with us';
      sec.appendChild(b);
    }
    sec.hidden = !sponsors.length;
    sec._update();
    // Gentle rotation (like the website), paused while a finger is on it or the app is in the background
    clearInterval(homeTimer);
    if (sponsors.length > 1) {
      let lastTouch = 0;
      track.addEventListener('touchstart', () => { lastTouch = Date.now(); }, { passive: true });
      homeTimer = setInterval(() => {
        if (!document.body.contains(track)) { clearInterval(homeTimer); return; }
        if (document.hidden || Date.now() - lastTouch < 12000) return;
        const w = track.clientWidth;
        const atEnd = track.scrollLeft >= track.scrollWidth - w - 4;
        track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + w, behavior: 'smooth' });
      }, 6000);
    }
  }

  function buildFeaturedColumnists(sec, people) {
    const grid = sec.querySelector('.oo-snap');
    sec.classList.add('oo-people');
    grid.className = 'oo-people-grid';
    grid.innerHTML = '';
    people.forEach((p) => {
      const a = document.createElement('a');
      a.className = 'oo-person';
      a.href = p.href; a.target = '_blank'; a.rel = 'noopener';
      a.setAttribute('data-name', p.name);
      a.innerHTML = `${p.img ? `<img src="${escapeAttr(p.img)}" alt="" loading="lazy" decoding="async" />` : '<span class="oo-person-blank"></span>'}<span class="oo-person-name">${escapeHtml(p.name)}</span>`;
      grid.appendChild(a);
    });
    sec.hidden = !people.length;
    // Open each person's page inside the app when we can match them to an author
    fetchAllAuthors().then((authors) => {
      const byName = new Map(authors.map((u) => [u.name.toLowerCase().replace(/^(rep\.|sen\.|dr\.)\s+/, ''), u]));
      grid.querySelectorAll('.oo-person').forEach((a) => {
        const nm = (a.getAttribute('data-name') || '').toLowerCase().replace(/^(rep\.|sen\.|dr\.)\s+/, '');
        const u = byName.get(nm);
        if (u) { a.href = `#/archive?type=author&id=${u.id}&label=${encodeURIComponent(u.name)}`; a.removeAttribute('target'); a.removeAttribute('rel'); }
      });
    }).catch(() => {});
  }

  function renderHome() {
    stopTtsPlayback();
    clearInterval(homeTimer);
    app.innerHTML = '<div class="home-view oo-home"></div>';
    const view = app.querySelector('.oo-home');
    view.insertAdjacentHTML('afterbegin', '<div class="oo-tools oo-home-tools"><button type="button" class="oo-tool" data-tool="theme" aria-label="Switch light or dark mode" title="Switch light or dark mode"><i></i></button></div>');
    wireReaderTools(view);

    const defs = [
      ['latest', 'Latest News', 'substack', 15],
      ['columnists', 'National Columnists', 'columnists', 10],
      ['magazine', 'The Magazine', 'issues', 12],
      ['observercast', 'ObserverCast', 'observercast', 8],
      ['newsmakers', 'Newsmakers', 'newsmakers', 8],
      ['cartoon', 'Featured Cartoon', 'cartoon', 8]
    ];
    const secs = {};
    defs.forEach(([key, title, slug]) => {
      const sec = homeSectionEl(key, title, "", slug);
      secs[key] = sec;
      view.appendChild(sec);
    });
    // Website-built sections (need the Worker's home-extras route; they stay hidden until it answers)
    const sponsorSec = homeSectionEl('sponsors', 'Advertisers'); sponsorSec.hidden = true;
    const shopSec = homeSectionEl('shop', 'Shop the Observer'); shopSec.hidden = true;
    const peopleSec = homeSectionEl('people', 'Featured Columnists'); peopleSec.hidden = true;
    view.append(sponsorSec, shopSec, peopleSec);

    // First paint: skeleton for the lead while the (usually instant) snapshot or network answers
    if (!homeData.latest && !LS.get('ooHomeSec:' + SITE_KEY + ':latest', null)) {
      secs.latest.querySelector('.oo-snap').innerHTML = `<div class="oo-slide">${skeletonCards(3)}</div>`;
    }
    defs.forEach(([key, , slug, perPage]) => {
      if (key !== 'latest') secs[key].hidden = true;
      loadHomeSection(secs[key], key, slug, perPage);
    });

    loadHomeExtras().then((x) => {
      if (!x || !document.body.contains(view)) return;
      if (Array.isArray(x.sponsors) && x.sponsors.length) buildSponsors(sponsorSec, x.sponsors);
      if (x.shop && x.shop.img) {
        const track = shopSec.querySelector('.oo-snap');
        track.className = 'oo-shop';
        track.innerHTML = `<a href="${escapeAttr(x.shop.href)}" target="_blank" rel="noopener"><img src="${escapeAttr(x.shop.img)}" alt="Shop the Observer" loading="lazy" decoding="async" /></a>`;
        shopSec.hidden = false;
      }
      if (Array.isArray(x.columnists) && x.columnists.length) buildFeaturedColumnists(peopleSec, x.columnists);
    });

    if (homeState.initialized) restoreHomeScroll();
  }

  function renderHomeLegacy() {
    stopTtsPlayback();

    app.innerHTML = `
      <div class="home-view">
        <h2 class="oo-section-title">Latest News</h2>
        <div class="oo-lead" data-oo="lead"></div>
        <section class="oo-columnists" data-oo="columnists" hidden>
          <h2 class="oo-section-title">National Columnists</h2>
          <div class="oo-row" data-oo="col-row"></div>
        </section>
        <h2 class="oo-section-title">More News</h2>
        <div class="posts-grid"></div>
      </div>
    `;

    const grid = app.querySelector('.posts-grid');
    if (!grid) return;
    loadColumnists();

    if (!homeState.initialized) {
      isInitialHomeLoad = true;
      currentPage = 1;
      hasMorePages = true;
      seenPostIds.clear();
      window.__OKOBS_DUP_GUARD_ENABLED__ = true;

      // Instant start: draw the last visit's posts right away, then load fresh ones.
      const snap = skipSnapshotOnce ? null : LS.get('ooHomeSnap:' + SITE_KEY, null);
      skipSnapshotOnce = false;
      homeSnapIds = null;
      if (snap && Array.isArray(snap.posts) && snap.posts.length) {
        homeSnapIds = snap.posts.map((p) => p.id);
        snap.posts.forEach((p) => { seenPostIds.add(p.id); grid.appendChild(createPostCard(p)); });
        promoteLead(grid);
        hideInitialLoader();
      } else {
        grid.innerHTML = skeletonCards(6);
      }

      setupInfiniteScroll(grid);
      loadMorePosts();
    } else {
      // Returning from a post detail view:
      //  - rebuild grid from cached posts
      //  - then reattach infinite scroll
      hydrateExistingHomeGrid(grid);
      setupInfiniteScroll(grid);
      restoreHomeScroll();
    }
  }

    function hydrateExistingHomeGrid(grid) {
    // If we don't have a remembered home state or any seen posts,
    // fall back to a fresh load as a safety net.
    if (!homeState.initialized || !seenPostIds || seenPostIds.size === 0) {
      grid.innerHTML = '';
      currentPage = 1;
      hasMorePages = true;
      seenPostIds.clear();
      window.__OKOBS_DUP_GUARD_ENABLED__ = true;
      loadMorePosts();
      return;
    }

    // Rebuild only the most recent slice of cards to avoid rehydrating
    // an unbounded home grid after returning from detail.
    const frag = document.createDocumentFragment();

    for (const id of seenPostIds) {
      const post = postCache.get(id);
      if (!post) continue;

      // Still respect excluded categories, just in case.
      if (hasExcludedCategory(post)) continue;

      const card = createPostCard(post);
      frag.appendChild(card);
    }

    grid.innerHTML = '';
    grid.appendChild(frag);
    promoteLead(grid);

    console.debug(
      '[OkObserver] Rehydrated home grid from',
            seenPostIds.size,
      'recent cached posts'
    );
  }

  function setupInfiniteScroll(grid) {
    if (infiniteObserver) {
      infiniteObserver.disconnect();
      infiniteObserver = null;
    }

    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
// Ensure the sentinel has real dimensions so IntersectionObserver can reach
// intersectionRatio >= SCROLL_SENTRY_OFFSET (0.). A 0-height sentinel can “stall” scrolling.
sentinel.style.display = 'block';
sentinel.style.width = '100%';
sentinel.style.height = '1px';
    
grid.insertAdjacentElement('afterend', sentinel);

    infiniteObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
  requestMorePostsViaScroll();
}

      }
    }, {
  root: null,
  rootMargin: SCROLL_ROOT_MARGIN,
  threshold: [SCROLL_SENTRY_OFFSET]
});


    infiniteObserver.observe(sentinel);
  }

  function requestMorePostsViaScroll() {
    if (isFetchingPosts || !hasMorePages) return;
    if (infiniteScrollLoadTimeout) {
      clearTimeout(infiniteScrollLoadTimeout);
    }
    infiniteScrollLoadTimeout = setTimeout(() => {
      if (!isFetchingPosts && hasMorePages) {
        loadMorePosts();
      }
    }, 120);
  }

  async function loadMorePosts() {
    if (isFetchingPosts || !hasMorePages) return;

    isFetchingPosts = true;
    app.setAttribute('aria-busy', 'true');
    showPagingStatus(isInitialHomeLoad ? 'Loading news…' : 'Loading more…');

    const grid = app.querySelector('.home-view .posts-grid');
    if (!grid) {
      isFetchingPosts = false;
      hidePagingStatus();
      return;
    }

    try {
      console.debug('[OkObserver] Fetching page', currentPage);

      const posts = await fetchPostsPage(currentPage);
      if (!Array.isArray(posts) || posts.length === 0) {
        hasMorePages = false;
        clearSkeletons(grid);
        hidePagingStatus();
        return;
      }

      // Home was drawn from the last visit: if the fresh first page is the same posts, just keep it
      // (and give the app the full posts); otherwise replace it with the fresh ones.
      if (homeSnapIds && currentPage === 1) {
        const freshIds = posts.filter((p) => !hasExcludedCategory(p)).map((p) => p.id);
        const same = freshIds.length === homeSnapIds.length && freshIds.every((id, i) => id === homeSnapIds[i]);
        posts.forEach((p) => { if (!hasExcludedCategory(p)) postCache.set(p.id, p); });
        homeSnapIds = null;
        if (same) {
          // Rebuild the cards from the full posts so opening them is instant, without changing what is on screen.
          const g = app.querySelector('.home-view .posts-grid');
          const leadEl = app.querySelector('[data-oo="lead"]');
          if (g) g.innerHTML = '';
          if (leadEl) leadEl.innerHTML = '';
          const fresh = posts.filter((p) => !hasExcludedCategory(p));
          const frag2 = document.createDocumentFragment();
          fresh.forEach((p) => frag2.appendChild(createPostCard(p)));
          if (g) { g.appendChild(frag2); promoteLead(g); }
          currentPage += 1;
          hidePagingStatus();
          isInitialHomeLoad = false;
          hideInitialLoader();
          return;
        }
        grid.innerHTML = '';
        const leadEl2 = app.querySelector('[data-oo="lead"]');
        if (leadEl2) leadEl2.innerHTML = '';
        seenPostIds.clear();
      }
      clearSkeletons(grid);

                  let appendedCount = 0;
      const postsToRender = [];

      for (const post of posts) {
        if (hasExcludedCategory(post)) {
          continue;
        }

        if (seenPostIds.has(post.id)) {
          continue;
        }

        // Cache this post so we can rebuild the grid when returning from detail.
        postCache.set(post.id, post);
        seenPostIds.add(post.id);
        postsToRender.push(post);
        appendedCount++;
      }

      if (appendedCount > 0) {
        const cardsToAppend = await buildPostCardsInChunks(postsToRender, 4);
        await appendCardsInChunks(grid, cardsToAppend, 4);
        promoteLead(grid);
      }
// If WP returned posts but all were filtered out (e.g., cartoons),
// skip ahead to the next page automatically instead of “stalling” infinite scroll.
if (posts.length > 0 && appendedCount === 0) {
  currentPage += 1;
  hidePagingStatus();

  // Let the current call unwind (so finally runs) before fetching the next page.
  setTimeout(() => {
    loadMorePosts();
  }, 0);

  return;
}


      currentPage += 1;
      hidePagingStatus();

      if (isInitialHomeLoad) {
        isInitialHomeLoad = false;
        hideInitialLoader();
        if (currentPage === 2 && postsToRender.length) {
          LS.set('ooHomeSnap:' + SITE_KEY, { t: Date.now(), posts: postsToRender.slice(0, 12).map(compactPost) });
        }
      }
    } catch (err) {
      console.error('[OkObserver] Error loading more posts:', err);
      clearSkeletons(grid);
      hidePagingStatus();
    } finally {
      isFetchingPosts = false;
    }
  }

  function showPagingStatus(labelText) {
  let status = document.querySelector('.paging-status');
  if (!status) {
    status = document.createElement('div');
    status.className = 'paging-status';
    app.appendChild(status);
  }

  const label = labelText || 'Loading more…';

  status.innerHTML = `
    <div class="oo-detail-loading-inline">
      <span class="oo-loading-spinner" aria-hidden="true"></span>
      <span class="oo-loading-text">${label}</span>
    </div>
  `;

  status.style.display = 'block';
}


  function hidePagingStatus() {
    const status = document.querySelector('.paging-status');
    if (status) {
      status.style.display = 'none';
    }
    app.removeAttribute('aria-busy');
  }

  // ---------------------------------------------------------------------------
  // About view
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Website pages shown inside the app (Donate, Terms & Policies). Text comes from the website's own pages.
  // ---------------------------------------------------------------------------
  function wpFixContent(root) {
    root.querySelectorAll('style, script, noscript, iframe, object, embed').forEach((n) => n.remove());
    const absolutize = (u) => (u && /^\/(?!\/)/.test(u) ? OO_SITE_ORIGIN + u : u);
    root.querySelectorAll('img, source').forEach((el) => {
      const ds = el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
      const dss = el.getAttribute('data-srcset');
      if (ds) el.setAttribute('src', ds);
      if (dss) el.setAttribute('srcset', dss);
      ['data-src', 'data-lazy-src', 'data-original', 'data-srcset', 'data-sizes'].forEach((n) => el.removeAttribute(n));
      el.classList.remove('lazyload', 'lazyloaded');
      const s = el.getAttribute('src');
      if (s) el.setAttribute('src', absolutize(s));
      const ss = el.getAttribute('srcset');
      if (ss) el.setAttribute('srcset', ss.split(',').map((part) => { const t = part.trim().split(/\s+/); t[0] = absolutize(t[0]); return t.join(' '); }).join(', '));
      if (el.tagName === 'IMG') { el.removeAttribute('loading'); el.setAttribute('decoding', 'async'); el.classList.add('about-image-full'); }
    });
    root.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href') || '';
      if (h.startsWith('#')) return; // in-page jump
      if (/^\/(?!\/)/.test(h)) a.setAttribute('href', absolutize(h));
      a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener');
    });
    root.querySelectorAll('form').forEach((f) => {
      const act = f.getAttribute('action') || '';
      if (/^\/(?!\/)/.test(act)) f.setAttribute('action', absolutize(act));
      f.setAttribute('target', '_blank'); f.setAttribute('rel', 'noopener');
    });
  }

  const pageCache = {};
  async function renderWpPage(params) {
    stopTtsPlayback();
    const slug = String((params && params.slug) || '').replace(/[^a-z0-9-]/gi, '');
    const section = String((params && params.section) || '').replace(/[^a-z0-9_-]/gi, '');
    const label = (params && params.label) || '';
    lastListHash = window.location.hash || '#/';
    app.innerHTML = `<article class="about-view page-view"><h1 class="toc-title">${escapeHtml(label)}</h1><div class="about-html"><p>Loading…</p></div></article>`;
    if (!section) scrollToTop();
    const box = app.querySelector('.about-html');
    try {
      if (!pageCache[slug]) {
        const rows = await fetchJson(`${WP_API_BASE}/pages?slug=${encodeURIComponent(slug)}&_fields=id,title,content`);
        pageCache[slug] = Array.isArray(rows) && rows.length ? rows[0] : null;
      }
      const page = pageCache[slug];
      if (!document.body.contains(box)) return;
      if (!page || !page.content || !page.content.rendered) { box.innerHTML = '<p>This page isn’t available right now.</p>'; return; }
      box.innerHTML = page.content.rendered;
      // the page's own big title, if it repeats ours
      wpFixContent(box);
      const h = app.querySelector('.toc-title');
      if (h && !h.textContent.trim()) h.textContent = stripHtml((page.title && page.title.rendered) || '');
      if (section) {
        const target = box.querySelector('#' + CSS.escape(section));
        if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
        else scrollToTop();
      }
    } catch (err) {
      console.warn('[OkObserver] Page failed:', slug, err);
      if (document.body.contains(box)) box.innerHTML = '<p>Couldn’t load this page. Check your connection and try again.</p>';
    }
  }

  function renderAbout() {
    // Stop any TTS and go to top, like other views
    stopTtsPlayback();
    scrollToTop();

    const appRoot = document.getElementById("app");
    if (!appRoot) return;

    appRoot.innerHTML = `
    <article class="about-view">
      <h1 class="about-title">About The Oklahoma Observer</h1>
      <div class="about-content">
        <div class="about-html"></div>
      </div>
    </article>
  `;

    const aboutHtmlEl = document.querySelector(".about-html");
    if (!aboutHtmlEl) return;

    // Preferred: the website's own designed About page (same block, same styles), read live through the Worker.
    fetch(WORKER_BASE + '/content/about-page')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => {
        if (!d || !d.html || d.html.indexOf('class="ooan"') < 0) throw new Error('bad');
        if (!document.body.contains(aboutHtmlEl)) return;
        const view = aboutHtmlEl.closest('.about-view');
        if (view) view.classList.add('is-ooan');
        aboutHtmlEl.innerHTML = d.html;
        aboutHtmlEl.querySelectorAll('a[href^="http"]').forEach((l) => { l.target = '_blank'; l.rel = 'noopener'; });
        aboutHtmlEl.querySelectorAll('a[href^="#"]').forEach((l) => l.addEventListener('click', (e) => {
          e.preventDefault();
          const t = aboutHtmlEl.querySelector('[id="' + l.getAttribute('href').slice(1) + '"]');
          if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
      })
      .catch(() => loadAboutFromApi());

    function loadAboutFromApi() {
    fetchAboutPage()
      .then((page) => {
        const rawHtml =
          page && page.content && page.content.rendered
            ? page.content.rendered
            : "";

        if (!rawHtml) {
          aboutHtmlEl.innerHTML = "<p>Unable to load About content.</p>";
          return;
        }

        const tmp = document.createElement("div");
        tmp.innerHTML = rawHtml;

        // TagDiv layout: three columns using td-pb-span4 / td-pb-span8
        const wpColumns = tmp.querySelectorAll(".td-pb-span4, .td-pb-span8");

        if (wpColumns.length) {
          aboutHtmlEl.innerHTML = "";

          wpColumns.forEach((col) => {
            const wrapper = document.createElement("div");
            wrapper.className = "about-column";
            wrapper.innerHTML = col.innerHTML;
            aboutHtmlEl.appendChild(wrapper);
          });

          // Fix lazy-loaded images so About photos actually show
          aboutHtmlEl.querySelectorAll("img").forEach((img) => {
            const src =
              img.getAttribute("data-src") ||
              img.getAttribute("data-lazy-src") ||
              img.getAttribute("data-original");
            const srcset = img.getAttribute("data-srcset");

            if (src) img.src = src;
            if (srcset) img.srcset = srcset;

            img.removeAttribute("data-src");
            img.removeAttribute("data-lazy-src");
            img.removeAttribute("data-original");
            img.removeAttribute("data-srcset");
            img.removeAttribute("data-sizes");

            img.classList.remove("lazyload", "lazyloaded");
            img.classList.add("about-image-full");
          });
        } else {
          // Fallback: just show the whole HTML if we can't find specific columns
          aboutHtmlEl.innerHTML = rawHtml;
        }

        // The page's own pictures and links are written relative to the website ("/wp-content/..."),
        // which point nowhere from inside the app. Make them point at the website.
        const absolutize = (u) => (u && /^\/(?!\/)/.test(u) ? OO_SITE_ORIGIN + u : u);
        aboutHtmlEl.querySelectorAll('img, source').forEach((el) => {
          // Smush "lazy load" leaves a 1-pixel placeholder in src and the real picture in data-src
          const ds = el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
          const dss = el.getAttribute('data-srcset');
          if (ds) el.setAttribute('src', ds);
          if (dss) el.setAttribute('srcset', dss);
          ['data-src', 'data-lazy-src', 'data-original', 'data-srcset', 'data-sizes'].forEach((n) => el.removeAttribute(n));
          el.classList.remove('lazyload', 'lazyloaded');
          const s = el.getAttribute('src');
          if (s) el.setAttribute('src', absolutize(s));
          const ss = el.getAttribute('srcset');
          if (ss) el.setAttribute('srcset', ss.split(',').map((part) => {
            const t = part.trim().split(/\s+/);
            t[0] = absolutize(t[0]);
            return t.join(' ');
          }).join(', '));
          if (el.tagName === 'IMG') { el.removeAttribute('loading'); el.setAttribute('decoding', 'async'); }
        });
        aboutHtmlEl.querySelectorAll('a[href]').forEach((a) => {
          const h = a.getAttribute('href');
          if (h && /^\/(?!\/)/.test(h)) { a.setAttribute('href', absolutize(h)); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
        });
      })
      .catch((err) => {
        console.error("[OkObserver] About page error:", err);
        aboutHtmlEl.innerHTML = "<p>Error loading About content.</p>";
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Search view
  // ---------------------------------------------------------------------------

  function renderSearch(params) {
    stopTtsPlayback();
    scrollToTop();

const initialQuery = (params && params.q) || '';
const authorId = (params && params.author) || null;
const authorLabel = (params && params.label) ? decodeURIComponent(params.label) : '';

    app.innerHTML = `
      <div class="search-view">
        <h1 class="search-title">Search News</h1>
        <form class="search-form" novalidate>
          <label class="search-label">
            <span class="search-label-text">Search term</span>
            <input
              class="search-input"
              type="search"
              name="q"
              placeholder="Type keywords&hellip;"
              value="${escapeAttr(authorId ? authorLabel : initialQuery)}"
            />
          </label>
          <button class="search-submit" type="submit">Search</button>
        </form>
        <div class="search-recent browse-chips" hidden></div>
        <div class="search-status" aria-live="polite">
  <span class="search-status-spinner" aria-hidden="true"></span>
  <span class="search-status-text"></span>
</div>

        <div class="search-results">
          <div class="posts-grid search-grid"></div>
        </div>
      </div>
    `;

    const form = app.querySelector('.search-form');
    const input = app.querySelector('.search-input');
    const statusEl = app.querySelector('.search-status');
    const grid = app.querySelector('.search-grid');

    if (!form || !input || !grid) return;
const statusTextEl = statusEl
  ? statusEl.querySelector('.search-status-text')
  : null;

  // Auto-focus the search box when the search view is shown,
  // without disturbing scroll restore.
    // Auto-focus ONLY when entering Search with no query.
  // If q is present (e.g., after clicking Search), do NOT refocus (prevents mobile keyboard pop).
  if (!initialQuery) {
    requestAnimationFrame(() => {
      if (document.body.contains(input)) {
        try {
          input.focus({ preventScroll: true });
        } catch (e) {
          // Fallback for older browsers
          try {
            input.focus();
          } catch (_) {}
        }
      }
    });
  }



// Recent searches (shown when the box is empty)
if (!initialQuery && !authorId) {
  const recentEl = app.querySelector('.search-recent');
  const recent = LS.get('ooRecentSearches', []);
  if (recentEl && recent.length) {
    recentEl.innerHTML = '<span class="browse-loading">Recent:</span>' + recent.map((t) =>
      `<a class="browse-chip" href="#/search?q=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('');
    recentEl.hidden = false;
  }
}
if (initialQuery && !authorId) rememberSearch(initialQuery);

if (authorId) {
  statusEl.classList.add('is-loading');
  if (statusTextEl) {
    statusTextEl.textContent = 'Loading author posts…';
  }
  performAuthorSearch(authorId, statusEl, grid);
} else if (initialQuery) {
  statusEl.classList.add('is-loading');
  if (statusTextEl) {
    statusTextEl.textContent = 'Searching…';
  }
  performSearch(initialQuery, statusEl, grid);
}


    form.addEventListener('submit', (evt) => {
      evt.preventDefault();
      const value = input.value.trim();
if (!value) {
  statusEl.classList.remove('is-loading');
  if (statusTextEl) {
    statusTextEl.textContent = 'Please enter a search term.';
  }
  grid.innerHTML = '';
  navigateTo('#/search');
  return;
}

// Show spinner + message
statusEl.classList.add('is-loading');
if (statusTextEl) {
  statusTextEl.textContent = authorId ? 'Loading author posts…' : 'Searching…';
}
grid.innerHTML = '';

      const enc = encodeURIComponent(value);

      if (authorId) {
        navigateTo(`#/search?author=${encodeURIComponent(authorId)}&label=${enc}`);
      } else {
        navigateTo(`#/search?q=${enc}`);
      }
    });
  }

async function performAuthorSearch(authorId, statusEl, grid) {
  const statusTextEl = statusEl
    ? statusEl.querySelector('.search-status-text')
    : null;  try {
    const url = `${WP_API_BASE.replace('/wp-json/wp/v2','')}/content/author-posts?author=${encodeURIComponent(authorId)}&per_page=${POSTS_PER_PAGE}&page=1`;

    console.debug('[OkObserver] Author search URL:', url);

    const data = await fetchJson(url);
    const posts = data && Array.isArray(data.posts) ? data.posts : [];

    if (!posts.length) {
      if (statusEl) statusEl.classList.remove('is-loading');
      if (statusTextEl) {
        statusTextEl.textContent = 'No posts found for this author.';
      }
      grid.innerHTML = '';
      return;
    }

    const frag = document.createDocumentFragment();
    let rendered = 0;

    posts.forEach((post) => {
      if (hasExcludedCategory(post)) return;
      const card = createPostCard(post);
      frag.appendChild(card);
      rendered++;
    });

    grid.innerHTML = '';

    if (rendered > 0) {
      grid.appendChild(frag);
      if (statusEl) statusEl.classList.remove('is-loading');
      if (statusTextEl) {
        const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
const label = urlParams.get('label');
const decodedLabel = label ? decodeURIComponent(label) : '';

statusTextEl.textContent = decodedLabel
  ? `Posts by ${decodedLabel}`
  : `${rendered} post${rendered === 1 ? '' : 's'} by this author.`;
      }
    } else {
      if (statusEl) statusEl.classList.remove('is-loading');
      if (statusTextEl) {
        statusTextEl.textContent = 'No visible posts found for this author.';
      }
    }

  } catch (err) {
    console.error('[OkObserver] Author search failed:', err);

    if (statusEl) statusEl.classList.remove('is-loading');
    if (statusTextEl) {
      statusTextEl.textContent = 'Error loading author posts.';
    }
    grid.innerHTML = '';
  }
}function renderToc() {
  stopTtsPlayback();
  scrollToTop();

  // Ensure PostDetail "Back to posts" returns here if user came from TOC
  lastListHash = '#/toc';

  // Build from already-loaded posts (no new fetch)
  const posts = [];
  seenPostIds.forEach((id) => {
    const p = postCache.get(id);
    if (!p) return;
    // Safety: keep cartoon filtering consistent (even though home already filters)
    if (hasExcludedCategory(p)) return;
    posts.push(p);
  });

  // Newest first (matches typical expectation)
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  app.innerHTML = `
    <div class="toc-view">
      <h1 class="toc-title">Table of Contents</h1>
      <p class="toc-subtitle">Loaded titles only (from your current session).</p>
      <ul class="toc-list"></ul>
    </div>
  `;

  const list = app.querySelector('.toc-list');
  if (!list) return;

  if (!posts.length) {
    list.innerHTML = `
      <li class="toc-empty">
        No posts loaded yet. Go back to <a href="#/">News</a> and let the feed load.
      </li>
    `;
    return;
  }

  const frag = document.createDocumentFragment();

  for (const post of posts) {
    const li = document.createElement('li');
    li.className = 'toc-item';

    const a = document.createElement('a');
    a.className = 'toc-link';
    a.href = `#/post/${post.id}`;
    a.innerHTML =
      post.title && post.title.rendered ? post.title.rendered : '(Untitled)';

    // Make detail prefill instant (same as clicking from grid)
    a.addEventListener('click', () => {
      lastClickedPostSummary = post;
    });

    const meta = document.createElement('div');
    meta.className = 'toc-meta';
    const dateStr = formatDate(post.date);
    const authorName = getAuthorName(post);
    let metaText = '';
    if (authorName) metaText += authorName;
    if (dateStr) metaText += (metaText ? ' • ' : '') + dateStr;
    meta.textContent = metaText;

    li.appendChild(a);
    if (metaText) li.appendChild(meta);
    frag.appendChild(li);
  }

  list.appendChild(frag);
}

// ---------------------------------------------------------------------------
// Archives: author / topic (tag) / category pages + the "Browse" hub
//   #/browse                                  -> hub (authors, topics, categories)
//   #/archive?type=author|tag|category&id=N&label=Name
// Uses the standard WordPress REST list endpoints (same data the website archives use).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Events: the Observer's public Google Calendar, read through the Worker (/content/events)
// ---------------------------------------------------------------------------
function renderEvents() {
  stopTtsPlayback();
  scrollToTop();
  lastListHash = '#/events';
  const token = ++archiveToken;
  const TZ = 'America/Chicago';

  app.innerHTML = `
    <div class="events-view">
      <h1 class="toc-title">Events</h1>
      <p class="toc-subtitle">Upcoming Oklahoma Observer events. Times are Central.</p>
      <div class="search-status is-loading" aria-live="polite">
        <span class="search-status-spinner" aria-hidden="true"></span>
        <span class="search-status-text">Loading events…</span>
      </div>
      <div class="events-list"></div>
      <h2 class="browse-heading cal-heading" hidden>The full month</h2>
      <div class="cal-wrap" hidden></div>
      <details class="events-past" hidden><summary>Past events</summary><div class="events-past-list"></div></details>
    </div>`;

  const statusEl = app.querySelector('.search-status');
  const statusText = app.querySelector('.search-status-text');
  const listEl = app.querySelector('.events-list');
  const pastWrap = app.querySelector('.events-past');
  const pastList = app.querySelector('.events-past-list');

  const fmt = (d, opts) => new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: TZ }, opts)).format(d);
  const gcalStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  function whenText(ev, s, e) {
    if (ev.allDay) return fmt(s, { weekday: 'long', month: 'long', day: 'numeric' });
    const day = fmt(s, { weekday: 'long', month: 'long', day: 'numeric' });
    const t1 = fmt(s, { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
    const t2 = fmt(e, { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
    return `${day}, ${t1}${e > s ? ' – ' + t2 : ''}`;
  }

  function decodeEntities(s) { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; }

  // Some calendar descriptions contain a little web-page code (<br>, an RSVP link). Pull out the https links
  // as buttons and turn everything else into plain text.
  function splitDescription(raw) {
    const links = [];
    let text = String(raw || '').replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, label) => {
      if (/^https:\/\//i.test(href)) links.push({ href: decodeEntities(href), label: (/^https?:\/\//i.test(decodeEntities(String(label).replace(/<[^>]*>/g, '')).trim()) ? '' : decodeEntities(String(label).replace(/<[^>]*>/g, '')).trim()) || 'More info' });
      return '\n';
    });
    text = text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, '');
    return { text: decodeEntities(text), links };
  }

  function descHtml(text) {
    // The calendar text repeats place/date/time on emoji lines; the card already shows those, so drop them.
    return String(text || '').split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^[\u{1F4CD}\u{1F4C5}\u{1F555}\u{1F550}-\u{1F55B}]/u.test(l))
      .map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  }

  function eventCard(ev) {
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    const addUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(ev.title)
      + '&dates=' + gcalStamp(s) + '/' + gcalStamp(e)
      + '&location=' + encodeURIComponent(ev.location || '');
    const parts = splitDescription(ev.description);
    const linkBtns = parts.links.map((l) =>
      `<a class="btnPrimary event-add" href="${escapeAttr(l.href)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`).join(' ');
    const el = document.createElement('article');
    el.className = 'event-card';
    el.innerHTML = `
      <div class="event-date" aria-hidden="true">
        <span class="event-mon">${escapeHtml(fmt(s, { month: 'short' }))}</span>
        <span class="event-day">${escapeHtml(fmt(s, { day: 'numeric' }))}</span>
        <span class="event-wd">${escapeHtml(fmt(s, { weekday: 'short' }))}</span>
      </div>
      <div class="event-body">
        <h2 class="event-title">${escapeHtml(ev.title)}</h2>
        <div class="event-when">${escapeHtml(whenText(ev, s, e))}</div>
        ${ev.location ? `<div class="event-loc">${escapeHtml(ev.location.replace(/,\s*USA$/, ''))}</div>` : ''}
        <div class="event-desc">${descHtml(parts.text)}</div>
        ${linkBtns}
        <a class="btnSecondary event-add" href="${escapeAttr(addUrl)}" target="_blank" rel="noopener">Add to calendar</a>
      </div>`;
    return el;
  }

  // ---- Month grid (same events as the list; days are Central time) ----
  const ymdCT = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  function buildMonth(events) {
    const wrap = app.querySelector('.cal-wrap');
    const heading = app.querySelector('.cal-heading');
    if (!wrap) return;
    wrap.hidden = false;
    heading.hidden = false;

    // events by Central calendar day (multi-day events fill each day)
    const byDay = {};
    events.forEach((ev) => {
      const s = new Date(ev.start);
      const e = new Date(Math.max(new Date(ev.end).getTime() - 1, s.getTime()));
      let key = ymdCT(s);
      const last = ymdCT(e);
      for (let i = 0; i < 14; i++) {
        (byDay[key] = byDay[key] || []).push(ev);
        if (key >= last) break;
        const d = new Date(key + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        key = d.toISOString().slice(0, 10);
      }
    });

    const todayKey = ymdCT(new Date());
    let year = parseInt(todayKey.slice(0, 4), 10);
    let month = parseInt(todayKey.slice(5, 7), 10) - 1;
    let selected = '';

    function shortTime(ev) {
      if (ev.allDay) return '';
      return fmt(new Date(ev.start), { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', '').toLowerCase();
    }

    function draw() {
      const first = new Date(Date.UTC(year, month, 1));
      const lead = first.getUTCDay();
      const daysIn = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const rows = Math.ceil((lead + daysIn) / 7);
      const monthName = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(first);
      let cells = '';
      for (let i = 0; i < rows * 7; i++) {
        const d = new Date(Date.UTC(year, month, 1 - lead + i, 12));
        const key = d.toISOString().slice(0, 10);
        const out = d.getUTCMonth() !== month;
        const list = byDay[key] || [];
        const cls = ['cal-day', out ? 'cal-out' : '', key === todayKey ? 'cal-today' : '', list.length ? 'cal-has' : '', key === selected ? 'cal-sel' : ''].filter(Boolean).join(' ');
        const chips = list.slice(0, 2).map((ev) => `<span class="cal-ev">${escapeHtml((shortTime(ev) ? shortTime(ev) + ' ' : '') + ev.title)}</span>`).join('');
        const more = list.length > 2 ? `<span class="cal-more">+${list.length - 2} more</span>` : '';
        const dot = list.length ? '<span class="cal-dot" aria-hidden="true"></span>' : '';
        const label = `${d.getUTCDate()}${list.length ? ', ' + list.length + ' event' + (list.length === 1 ? '' : 's') : ''}`;
        cells += `<button type="button" class="${cls}" data-key="${key}" aria-label="${escapeAttr(label)}"><span class="cal-num">${d.getUTCDate()}</span>${dot}${chips}${more}</button>`;
      }
      wrap.innerHTML = `
        <div class="cal-head">
          <button type="button" class="cal-nav" data-nav="-1" aria-label="Previous month">&lsaquo;</button>
          <div class="cal-title">${escapeHtml(monthName)}</div>
          <button type="button" class="cal-nav" data-nav="1" aria-label="Next month">&rsaquo;</button>
        </div>
        <div class="cal-wd">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((n) => `<span>${n}</span>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
        <div class="cal-foot"><button type="button" class="cal-today-btn">Today</button></div>
        <div class="cal-detail"></div>`;
      const detail = wrap.querySelector('.cal-detail');
      if (selected && byDay[selected]) {
        const sd = new Date(selected + 'T12:00:00Z');
        detail.innerHTML = `<h3 class="cal-detail-title">${escapeHtml(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(sd))}</h3>`;
        byDay[selected].forEach((ev) => detail.appendChild(eventCard(ev)));
      }
    }

    wrap.addEventListener('click', (evt) => {
      const nav = evt.target.closest && evt.target.closest('.cal-nav');
      if (nav) {
        month += parseInt(nav.getAttribute('data-nav'), 10);
        if (month < 0) { month = 11; year -= 1; }
        if (month > 11) { month = 0; year += 1; }
        selected = '';
        draw();
        return;
      }
      if (evt.target.closest && evt.target.closest('.cal-today-btn')) {
        year = parseInt(todayKey.slice(0, 4), 10);
        month = parseInt(todayKey.slice(5, 7), 10) - 1;
        selected = '';
        draw();
        return;
      }
      const day = evt.target.closest && evt.target.closest('.cal-day');
      if (day && day.classList.contains('cal-has')) {
        selected = day.getAttribute('data-key');
        draw();
        const dt = wrap.querySelector('.cal-detail');
        if (dt && dt.scrollIntoView) dt.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    draw();
  }

  fetchJson(`${WORKER_BASE}/content/events`)
    .then((data) => {
      if (token !== archiveToken) return;
      const events = (data && Array.isArray(data.events)) ? data.events : [];
      buildMonth(events);
      const now = Date.now();
      const upcoming = events.filter((ev) => new Date(ev.end).getTime() >= now);
      const past = events.filter((ev) => new Date(ev.end).getTime() < now).reverse().slice(0, 12);
      statusEl.classList.remove('is-loading');
      statusText.textContent = upcoming.length
        ? `${upcoming.length} upcoming event${upcoming.length === 1 ? '' : 's'}.`
        : 'No upcoming events are scheduled right now. Check back soon.';
      upcoming.forEach((ev) => listEl.appendChild(eventCard(ev)));
      if (past.length) {
        pastWrap.hidden = false;
        past.forEach((ev) => pastList.appendChild(eventCard(ev)));
      }
    })
    .catch((err) => {
      console.error('[OkObserver] Events load failed:', err);
      if (token !== archiveToken) return;
      statusEl.classList.remove('is-loading');
      statusText.textContent = 'Could not load events. Please try again.';
    });
}

// ===========================================================================
// App extras: save for later, share, reader controls, follow + My Feed, recent searches,
// pull-to-refresh, "new posts" pill, loading placeholders, instant home from the last visit.
// Everything is stored on the phone (localStorage); no account needed.
// ===========================================================================
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
};
const SITE_KEY = String(window.OO_SITE_ORIGIN || 'prod'); // saved snapshots are per-site, so staging data never shows after launch
let skipSnapshotOnce = false;
let homeSnapIds = null;

function toast(msg) {
  let t = document.querySelector('.oo-toast');
  if (!t) { t = document.createElement('div'); t.className = 'oo-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('is-on'), 2200);
}

// Small copy of a post (enough to draw a card) for snapshots, Saved and offline-friendly lists.
function compactPost(p) {
  const img = getFeaturedImageUrl(p);
  const list = p && p._embedded && Array.isArray(p._embedded.author) ? p._embedded.author : [];
  const a = list[0] || null;
  const wt = p && p._embedded && Array.isArray(p._embedded['wp:term'])
    ? p._embedded['wp:term'].map((arr) => (arr || []).map((t) => ({ id: t.id, name: t.name, slug: t.slug, taxonomy: t.taxonomy })))
    : [];
  return {
    id: p.id,
    date: p.date,
    link: p.link,
    title: { rendered: (p.title && p.title.rendered) || '' },
    excerpt: { rendered: (p.excerpt && p.excerpt.rendered) || '' },
    author: p.author,
    _embedded: {
      author: a ? [{ id: a.id, name: a.name }] : [],
      'wp:featuredmedia': img ? [{ source_url: img }] : [],
      'wp:term': wt
    }
  };
}

const ICON_SAVE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-3.8-6.5 3.8v-16a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
const ICON_SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 15V3m0 0L8 7m4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---- Saved ----
const getSaved = () => LS.get('ooSaved', []);
const isSaved = (id) => getSaved().some((p) => p.id === id);
function toggleSaved(p) {
  const list = getSaved();
  const i = list.findIndex((x) => x.id === p.id);
  if (i >= 0) { list.splice(i, 1); LS.set('ooSaved', list); return false; }
  list.unshift(compactPost(p));
  LS.set('ooSaved', list.slice(0, 100));
  return true;
}
function syncSaveButtons(id) {
  const on = isSaved(id);
  document.querySelectorAll('[data-save-id="' + id + '"]').forEach((b) => {
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('is-saved', on);
    b.title = on ? 'Remove from Saved' : 'Save for later';
    const l = b.querySelector('.lbl');
    if (l) l.textContent = on ? 'Saved' : 'Save';
  });
}
function wireSaveButton(btn, post) {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = toggleSaved(post);
    syncSaveButtons(post.id);
    toast(now ? 'Saved for later' : 'Removed from Saved');
    if (!now && parseHashRoute().path === '/saved') {
      const card = btn.closest('.post-card');
      if (card) card.remove();
      if (!app.querySelector('.saved-grid .post-card')) renderSaved();
    }
  });
}

// ---- Share ----
async function sharePost(post) {
  const url = post.link || window.OO_SITE_ORIGIN || 'https://okobserver.org';
  const title = stripHtml((post.title && post.title.rendered) || 'The Oklahoma Observer');
  try {
    if (navigator.share) { await navigator.share({ title, text: title, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (__) {}
    ta.remove();
    toast(ok ? 'Link copied' : url);
  }
}

// ---- Reader controls (text size + line spacing, remembered) ----
const READ_SIZES = [0.9, 1, 1.12, 1.25, 1.4];
function applyReader() {
  const root = document.documentElement;
  root.style.setProperty('--oo-read-scale', String(LS.get('ooReadScale', 1)));
  root.style.setProperty('--oo-read-leading', LS.get('ooReadLoose', 0) ? '2' : '1.72');
}
function stepReader(dir) {
  const cur = LS.get('ooReadScale', 1);
  let i = READ_SIZES.findIndex((x) => x >= cur - 0.001);
  if (i < 0) i = 1;
  i = Math.max(0, Math.min(READ_SIZES.length - 1, i + dir));
  LS.set('ooReadScale', READ_SIZES[i]);
  applyReader();
  toast('Text size ' + Math.round(READ_SIZES[i] * 100) + '%');
}
function toggleReaderSpacing() {
  const loose = LS.get('ooReadLoose', 0) ? 0 : 1;
  LS.set('ooReadLoose', loose);
  applyReader();
  toast(loose ? 'Roomier line spacing' : 'Standard line spacing');
}
applyReader();

// ---- Follow authors / topics / sections ----
const getFollows = () => LS.get('ooFollows', []);
const isFollowing = (type, id) => getFollows().some((f) => f.type === type && String(f.id) === String(id));
function toggleFollow(type, id, label) {
  let list = getFollows();
  const i = list.findIndex((f) => f.type === type && String(f.id) === String(id));
  if (i >= 0) { list.splice(i, 1); LS.set('ooFollows', list); return false; }
  list.unshift({ type, id: String(id), label: label || '' });
  LS.set('ooFollows', list.slice(0, 40));
  return true;
}

// ---- Recent searches ----
function rememberSearch(term) {
  term = String(term || '').trim();
  if (!term) return;
  const list = LS.get('ooRecentSearches', []).filter((x) => x.toLowerCase() !== term.toLowerCase());
  list.unshift(term);
  LS.set('ooRecentSearches', list.slice(0, 8));
}

// ---- Loading placeholders ----
function skeletonCards(n) {
  let html = '';
  for (let i = 0; i < n; i++) {
    html += '<article class="post-card is-skeleton" aria-hidden="true"><div class="post-card-image-wrapper"></div>'
      + '<div class="post-card-content"><div class="sk-line sk-w90"></div><div class="sk-line sk-w60"></div><div class="sk-line sk-w40"></div></div></article>';
  }
  return html;
}
function clearSkeletons(root) {
  (root || document).querySelectorAll('.is-skeleton').forEach((e) => e.remove());
}

// ---- Home refresh, pull-to-refresh, "new posts" pill ----
function refreshHome() {
  homeState.initialized = false;
  homeState.scrollY = 0;
  seenPostIds.clear();
  columnistPosts = null;
  homeData = Object.create(null);
  homePos = Object.create(null);
  skipSnapshotOnce = true;
  const pill = document.querySelector('.oo-newpill');
  if (pill) pill.hidden = true;
  scrollToTop();
  renderHome();
}
window.__ooRefreshHome = refreshHome;

(function setupPullToRefresh() {
  const el = document.createElement('div');
  el.className = 'oo-ptr';
  el.innerHTML = '<span class="oo-loading-spinner" aria-hidden="true"></span><span class="oo-ptr-text">Pull to refresh</span>';
  document.body.appendChild(el);
  const text = el.querySelector('.oo-ptr-text');
  let startY = 0; let dy = 0; let active = false;
  const menuOpen = () => !!document.querySelector('[data-oo="overlay"]:not([hidden])');
  window.addEventListener('touchstart', (e) => {
    if (parseHashRoute().path !== '/' || (window.scrollY || 0) > 0 || e.touches.length !== 1 || menuOpen()) { active = false; return; }
    active = true; startY = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!active) return;
    dy = e.touches[0].clientY - startY;
    if (dy <= 0) { el.classList.remove('is-on'); el.style.transform = ''; return; }
    const d = Math.min(dy * 0.5, 90);
    el.classList.add('is-on');
    el.style.transform = 'translate(-50%,' + (d - 56) + 'px)';
    text.textContent = d >= 60 ? 'Release to refresh' : 'Pull to refresh';
  }, { passive: true });
  window.addEventListener('touchend', () => {
    if (!active) return;
    active = false;
    const d = Math.min(dy * 0.5, 90);
    el.classList.remove('is-on'); el.style.transform = '';
    if (d >= 60 && (window.scrollY || 0) <= 0) { toast('Refreshing…'); refreshHome(); }
  }, { passive: true });
})();

(function setupNewPostsPill() {
  const pill = document.createElement('button');
  pill.className = 'oo-newpill'; pill.type = 'button'; pill.hidden = true;
  pill.textContent = 'New posts · tap to refresh';
  document.body.appendChild(pill);
  pill.addEventListener('click', () => { pill.hidden = true; refreshHome(); });
  async function check() {
    if (document.hidden) return;
    if (parseHashRoute().path !== '/') { pill.hidden = true; return; }
    if (!seenPostIds.size) return;
    try {
      const rows = await fetchJson(`${WP_API_BASE}/posts?per_page=4&_embed=wp:term&_fields=id,_links,_embedded&nocache=1`);
      const newest = (Array.isArray(rows) ? rows : []).find((p) => !hasExcludedCategory(p));
      if (newest && !seenPostIds.has(newest.id)) pill.hidden = false;
    } catch (_) {}
  }
  setInterval(check, 180000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(check, 1500); });
})();

// ---- "You're leaving the app" notice for every link that goes to another website ----
(function setupLeaveNotice() {
  let box = null; let pending = null; let openedAt = 0;
  function hostOf(u) { try { return new URL(u, location.href); } catch (_) { return null; } }
  function isExternal(href) {
    if (!href) return false;
    const u = hostOf(href);
    if (!u || !/^https?:$/.test(u.protocol)) return false; // mailto:, tel:, #/ routes stay as they are
    return u.origin !== location.origin;
  }
  function close() {
    if (box) { box.remove(); box = null; }
    document.removeEventListener('keydown', onKey, true);
    pending = null;
  }
  function go() {
    const p = pending;
    close();
    if (!p) return;
    if (p.form) { try { p.form.submit(); } catch (_) {} return; }
    const a = document.createElement('a');
    a.href = p.url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function onKey(e) {
    if (!box || e.repeat || Date.now() - openedAt < 250) return;
    e.preventDefault(); e.stopPropagation();
    go();
  }
  function show(p) {
    close();
    pending = p;
    openedAt = Date.now();
    // if the menu is open, close it behind the notice
    document.body.classList.remove('is-menu-open');
    const mdlg = document.querySelector('dialog.oo-nm'); if (mdlg && mdlg.open) { try { mdlg.close(); } catch (e) {} }
    const ov = document.querySelector('[data-oo="overlay"]'); if (ov) ov.hidden = true;
    const hb = document.querySelector('[data-oo="hamburger"]'); if (hb) hb.setAttribute('aria-expanded', 'false');
    const u = hostOf(p.url);
    box = document.createElement('div');
    box.className = 'oo-leave';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Leaving the app');
    box.innerHTML = '<div class="oo-leave-card"><h2>You’re leaving the app</h2>'
      + '<p>This opens <strong></strong> in your browser.</p>'
      + '<p class="oo-leave-hint">Press any key to continue.</p>'
      + '<div class="oo-leave-btns"><button type="button" class="oo-leave-go">Continue</button><button type="button" class="oo-leave-stay">Stay in the app</button></div></div>';
    box.querySelector('strong').textContent = u ? u.hostname.replace(/^www\./, '') : 'a website';
    box.querySelector('.oo-leave-go').addEventListener('click', go);
    box.querySelector('.oo-leave-stay').addEventListener('click', close);
    box.addEventListener('click', (e) => { if (e.target === box) go(); });
    document.body.appendChild(box);
    box.querySelector('.oo-leave-go').focus();
    document.addEventListener('keydown', onKey, true);
  }
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || box) return;
    const href = a.getAttribute('href');
    if (!isExternal(a.href)) return;
    e.preventDefault(); e.stopPropagation();
    show({ url: a.href });
  }, true);
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (!f || f.tagName !== 'FORM' || !isExternal(f.action)) return;
    e.preventDefault(); e.stopPropagation();
    show({ url: f.action, form: f });
  }, true);
})();

// ---- Saved screen ----
function renderSaved() {
  stopTtsPlayback();
  scrollToTop();
  lastListHash = '#/saved';
  archiveToken += 1;
  const list = getSaved();
  app.innerHTML = `
    <div class="archive-view saved-view">
      <h1 class="toc-title">Saved</h1>
      <p class="toc-subtitle">Posts you saved for later. They stay on this phone.</p>
      <div class="posts-grid archive-grid saved-grid"></div>
      <p class="saved-empty" hidden>Nothing saved yet. Tap the bookmark on any post to keep it here.</p>
    </div>`;
  const grid = app.querySelector('.saved-grid');
  if (!list.length) { app.querySelector('.saved-empty').hidden = false; return; }
  list.forEach((p) => grid.appendChild(createPostCard(p)));
}

// ---- My Feed screen ----
async function renderFollowing() {
  stopTtsPlayback();
  scrollToTop();
  lastListHash = '#/following';
  const token = ++archiveToken;
  const follows = getFollows();
  const chips = follows.map((f) =>
    `<span class="browse-chip follow-chip"><a href="${archiveHref(f.type, f.id, f.label)}">${escapeHtml(f.label || f.type)}</a>`
    + `<button type="button" class="follow-x" data-unfollow="${escapeAttr(f.type + ':' + f.id)}" aria-label="Unfollow ${escapeAttr(f.label || '')}">&times;</button></span>`).join('');
  app.innerHTML = `
    <div class="archive-view following-view">
      <h1 class="toc-title">My Feed</h1>
      <p class="toc-subtitle">The newest posts from the authors, topics and sections you follow.</p>
      <div class="browse-chips follow-chips">${chips}</div>
      <div class="search-status" aria-live="polite"><span class="search-status-text"></span></div>
      <div class="posts-grid archive-grid"></div>
      <p class="archive-browse"><a href="#/browse">Find something to follow &rarr;</a></p>
    </div>`;
  const statusText = app.querySelector('.search-status-text');
  const grid = app.querySelector('.archive-grid');
  app.querySelector('.follow-chips').addEventListener('click', (e) => {
    const x = e.target.closest && e.target.closest('[data-unfollow]');
    if (!x) return;
    const [t, ...rest] = x.getAttribute('data-unfollow').split(':');
    toggleFollow(t, rest.join(':'), '');
    renderFollowing();
  });
  if (!follows.length) {
    statusText.textContent = 'You are not following anything yet. Open an author, topic or section in Archives and tap Follow.';
    return;
  }
  grid.innerHTML = skeletonCards(4);
  const embed = '_embed=author,wp:featuredmedia,wp:term';
  const ids = (type) => follows.filter((f) => f.type === type).map((f) => encodeURIComponent(f.id)).join(',');
  const reqs = [];
  if (ids('tag')) reqs.push(fetchJson(`${WP_API_BASE}/posts?tags=${ids('tag')}&per_page=12&${embed}`).catch(() => []));
  if (ids('category')) reqs.push(fetchJson(`${WP_API_BASE}/posts?categories=${ids('category')}&per_page=12&${embed}`).catch(() => []));
  follows.filter((f) => f.type === 'author').slice(0, 6).forEach((f) => {
    reqs.push(fetch(`${WORKER_BASE}/content/author-archive?author=${encodeURIComponent(f.id)}&per_page=8&page=1`)
      .then((r) => (r.ok ? r.json() : { posts: [] })).then((d) => d.posts || []).catch(() => []));
  });
  const results = (await Promise.all(reqs)).flat();
  if (token !== archiveToken) return;
  const seen = new Set();
  const posts = results
    .filter((p) => p && p.id && !seen.has(p.id) && seen.add(p.id) && !hasExcludedCategory(p))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 24);
  clearSkeletons(grid);
  if (!posts.length) { statusText.textContent = 'No recent posts from what you follow yet.'; return; }
  statusText.textContent = `${posts.length} recent post${posts.length === 1 ? '' : 's'}, newest first.`;
  posts.forEach((p) => { postCache.set(p.id, p); grid.appendChild(createPostCard(p)); });
}

const ARCHIVE_PARAM = { author: 'author', tag: 'tags', category: 'categories', year: 'year' };
const ARCHIVE_NOUN = { author: 'Author', tag: 'Topic', category: 'Category', year: 'Archive' };
let archiveToken = 0;
let authorListCache = null;

function archiveHref(type, id, label) {
  return `#/archive?type=${type}&id=${encodeURIComponent(id)}&label=${encodeURIComponent(label || '')}`;
}

function renderArchive(params) {
  stopTtsPlayback();
  scrollToTop();
  const type = ARCHIVE_PARAM[params && params.type] ? params.type : 'tag';
  let id = (params && params.id) || '';
  const slug = (params && params.slug) || '';   // menu shortcuts use the category name, not a number
  const label = (params && params.label) || '';
  const token = ++archiveToken;
  lastListHash = window.location.hash || '#/browse';

  app.innerHTML = `
    <div class="archive-view oo-arch">
      <h1 class="archive-title">${escapeHtml(label || ARCHIVE_NOUN[type])}</h1>
      <div class="oo-tools"><button type="button" class="oo-tool" data-tool="back" aria-label="Back" title="Back">&larr;</button><button type="button" class="oo-tool" data-tool="theme" aria-label="Switch light or dark mode" title="Switch light or dark mode"><i></i></button></div>
      ${type === 'year' ? '<div class="oo-yrs">' + (() => { let h = ''; for (let y = new Date().getFullYear(); y >= 2008; y--) h += '<a class="oo-yr' + (String(y) === String(id) ? ' is-on' : '') + '" href="#/archive?type=year&id=' + y + '&label=' + y + '">' + y + '</a>'; return h; })() + '</div>' : ''}
      <div class="archive-author" hidden></div>
      <div class="oo-arch-count" hidden><b class="oo-arch-n"></b><span class="oo-arch-l">${type === 'author' ? 'Articles by this author' : type === 'tag' ? 'Articles on this topic' : type === 'year' ? 'Articles this year' : 'Articles in this department'}</span></div>
      <button class="btnSecondary archive-follow" type="button" hidden></button>
      <div class="search-status is-loading" aria-live="polite">
        <span class="search-status-spinner" aria-hidden="true"></span>
        <span class="search-status-text">Loading posts…</span>
      </div>
      <div class="posts-grid archive-grid"></div>
      <div class="archive-more-wrap"><button class="btnSecondary archive-more" type="button" hidden>Load more</button></div>
      <p class="archive-browse"><a href="#/browse">&larr; Back to the Index</a></p>
    </div>`;
  wireReaderTools(app);

  const grid = app.querySelector('.archive-grid');
  const statusEl = app.querySelector('.search-status');
  const statusText = app.querySelector('.search-status-text');
  const moreBtn = app.querySelector('.archive-more');
  let page = 0;
  let shown = 0;
  let totalPages = 1;
  let busy = false;
  let authorShown = false;
  grid.innerHTML = skeletonCards(6);

  // Follow / Following button (stored on this phone; feeds "My Feed")
  const followBtn = app.querySelector('.archive-follow');
  function setupFollow() {
    if (!id || !followBtn) return;
    const paint = () => {
      const on = isFollowing(type, id);
      followBtn.hidden = false;
      followBtn.classList.toggle('is-on', on);
      followBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      followBtn.textContent = on ? '✓ Following' : '+ Follow';
    };
    if (!followBtn.__wired) {
      followBtn.__wired = true;
      followBtn.addEventListener('click', () => {
        const now = toggleFollow(type, id, label || ARCHIVE_NOUN[type]);
        toast(now ? 'Following ' + (label || 'this') + ' – see My Feed in the menu' : 'Unfollowed');
        paint();
      });
    }
    paint();
  }

  // Author pages: photo and bio, taken from the author details that come with the posts (no extra request).
  function showAuthorHeader(posts) {
    if (type !== 'author' || authorShown) return;
    for (const p of posts) {
      const list = p && p._embedded && Array.isArray(p._embedded.author) ? p._embedded.author : [];
      const a = list.find((x) => x && String(x.id) === String(id));
      if (!a) continue;
      const av = a.avatar_urls ? (a.avatar_urls['96'] || a.avatar_urls['48'] || '') : '';
      const bio = a.description ? sanitizeAuthorBioHtml(String(a.description).trim()) : '';
      if (!av && !bio) return;
      const box = app.querySelector('.archive-author');
      if (!box) return;
      box.innerHTML = `
        ${av ? `<img class="author-box-avatar archive-author-avatar" src="${escapeAttr(av)}" alt="${escapeAttr(a.name || label)}" />` : ''}
        <div class="archive-author-bio">${bio || ''}</div>`;
      box.hidden = false;
      authorShown = true;
      return;
    }
  }

  function showCount(n) {
    const v = parseInt(n, 10);
    if (!v || (type === 'year' && !id)) return;
    const box = app.querySelector('.oo-arch-count');
    if (!box) return;
    box.querySelector('.oo-arch-n').textContent = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    box.hidden = false;
  }

  async function loadPage() {
    if (busy) return;
    busy = true;
    moreBtn.hidden = true;
    statusEl.classList.add('is-loading');
    statusText.textContent = shown ? 'Loading more…' : 'Loading posts…';
    try {
      page += 1;
      let posts = [];
      if (type === 'author') {
        // WordPress blocks anonymous ?author= requests, so authors come through the Worker route.
        const res = await fetch(`${WORKER_BASE}/content/author-archive?author=${encodeURIComponent(id)}&per_page=${POSTS_PER_PAGE}&page=${page}`);
        if (token !== archiveToken) return;
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        posts = Array.isArray(data.posts) ? data.posts : [];
        totalPages = parseInt(data.total_pages || 1, 10) || 1;
        if (data.total) showCount(data.total);
      } else {
        const filter = type === 'year' ? (id ? `after=${encodeURIComponent(id + '-01-01T00:00:00')}&before=${encodeURIComponent((parseInt(id, 10) + 1) + '-01-01T00:00:00')}` : 'orderby=date') : `${ARCHIVE_PARAM[type]}=${encodeURIComponent(id)}`;
        const url = `${WP_API_BASE}/posts?${filter}&per_page=${POSTS_PER_PAGE}&page=${page}&_embed=author,wp:featuredmedia,wp:term`;
        const res = await fetch(url);
        if (token !== archiveToken) return;
        if (!res.ok) {
          // WordPress answers 400 when we ask for a page past the end.
          totalPages = page - 1;
          if (page === 1) throw new Error('HTTP ' + res.status);
        } else {
          totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10) || 1;
          showCount(res.headers.get('x-wp-total'));
          posts = await res.json();
        }
      }
      {
        const frag = document.createDocumentFragment();
        showAuthorHeader(Array.isArray(posts) ? posts : []);
        (Array.isArray(posts) ? posts : []).forEach((p) => {
          if (hasExcludedCategory(p)) return;
          postCache.set(p.id, p);
          if (shown === 0 || (shown === 1 && type !== 'year')) {
            const h = document.createElement('h2');
            h.className = 'oo-arch-h';
            h.textContent = type === 'year' ? (id ? 'Articles from ' + id : 'Newest articles') : (shown === 0 ? 'Latest article' : 'More articles');
            frag.appendChild(h);
          }
          const card = createPostCard(p);
          const meta = card.querySelector('.post-card-meta');
          if (meta) {
            const nm = getAuthorName(p);
            meta.innerHTML = '<span class="oo-m-date">' + escapeHtml(formatDate(p.date) || '') + '</span>' + (nm ? '<span class="oo-m-by">By <a href="' + archiveHref('author', p.author, nm) + '">' + escapeHtml(nm) + '</a></span>' : '');
          }
          card.classList.add('oo-rot-' + ((shown % 4) + 1)); // QA task 1: same 4-step panel rotation as the website archives
          frag.appendChild(card);
          shown += 1;
        });
        grid.appendChild(frag);
      }
      statusEl.classList.remove('is-loading');
      statusText.textContent = shown
        ? ''
        : 'No posts found in this archive.';
      moreBtn.hidden = page >= totalPages;
    } catch (err) {
      console.error('[OkObserver] Archive load failed:', err);
      if (token !== archiveToken) return;
      statusEl.classList.remove('is-loading');
      statusText.textContent = 'Could not load this archive. Please try again.';
      page = Math.max(0, page - 1);
      moreBtn.hidden = false;
    } finally {
      clearSkeletons(grid);
      busy = false;
    }
  }

  // Cartoon-category posts are hidden in the app, so a page can come back thin: keep going until a useful batch is shown.
  async function loadBatch() {
    setupFollow();
    const before = shown;
    for (let i = 0; i < 5; i++) {
      await loadPage();
      if (token !== archiveToken || moreBtn.hidden || shown - before >= 8) break;
    }
  }
  moreBtn.addEventListener('click', loadBatch);
  if (!id && slug && (type === 'category' || type === 'tag')) {
    fetchJson(`${WP_API_BASE}/${type === 'tag' ? 'tags' : 'categories'}?slug=${encodeURIComponent(slug)}&_fields=id`)
      .then((rows) => {
        if (token !== archiveToken) return;
        id = rows && rows[0] ? rows[0].id : '';
        if (!id) { statusEl.classList.remove('is-loading'); statusText.textContent = 'This section was not found.'; return; }
        loadBatch();
      })
      .catch(() => { statusEl.classList.remove('is-loading'); statusText.textContent = 'Could not load this section. Please try again.'; });
    return;
  }
  if (!id && type !== 'year') {
    statusEl.classList.remove('is-loading');
    statusText.textContent = 'Choose an archive from the Browse page.';
    return;
  }
  loadBatch();
}

async function fetchAllAuthors() {
  if (authorListCache) return authorListCache;
  const res = await fetch(`${WORKER_BASE}/content/authors`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const all = (Array.isArray(data.authors) ? data.authors : []).filter((u) => u && u.id && u.name && !/^admix$/i.test(String(u.name).trim()));
  all.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  authorListCache = all;
  return all;
}

// Back / light-dark buttons used by the Index and archive pages (same as the website's round buttons)
function wireReaderTools(root) {
  const back = root.querySelector('[data-tool="back"]');
  if (back) back.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back(); else window.location.hash = '#/';
  });
  const th = root.querySelector('[data-tool="theme"]');
  if (th) th.addEventListener('click', () => {
    const el = document.documentElement;
    const next = el.getAttribute('data-oo-theme') === 'light' ? 'dark' : 'light';
    el.setAttribute('data-oo-theme', next);
    try { localStorage.setItem('ooTheme', next); } catch (err) {}
  });
}

// The Index page: same look and same topic list as the website's /index/ page
function renderBrowse(params) {
  stopTtsPlayback();
  scrollToTop();
  lastListHash = '#/browse';
  const token = ++archiveToken;
  const letters = ['', '#', '0-9'].concat('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
  const lab = (L) => (L === '' ? 'All' : L === '0-9' ? '0–9' : L);
  app.innerHTML = `
    <div class="oo-ix">
      <h1 class="oo-ix-title">Index</h1>
      <div class="oo-tools"><button type="button" class="oo-tool" data-tool="back" aria-label="Back" title="Back">&larr;</button><button type="button" class="oo-tool" data-tool="theme" aria-label="Switch light or dark mode" title="Switch light or dark mode"><i></i></button></div>
      <p class="oo-ix-sub">Every article we have filed, and what it's about.</p>
      <label class="oo-ix-label" for="oo-ix-q">Find a term or topic</label>
      <input id="oo-ix-q" class="oo-ix-q" type="search" placeholder="Search all topics" autocomplete="off" />
      <div class="oo-ix-az">${letters.map((L) => '<button type="button" class="oo-ix-l' + (L === '' ? ' is-on' : '') + '" data-l="' + L + '">' + lab(L) + '</button>').join('')}</div>
      <p class="oo-ix-status" aria-live="polite">Loading topics…</p>
      <ul class="oo-ix-list"></ul>
      <button type="button" class="oo-ix-more" hidden>Show more topics</button>
    </div>`;
  wireReaderTools(app);
  const q = app.querySelector('.oo-ix-q');
  const list = app.querySelector('.oo-ix-list');
  const stat = app.querySelector('.oo-ix-status');
  const more = app.querySelector('.oo-ix-more');
  const BATCH = 100;
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let D = null; let cur = ''; let arr = null; let shown = 0;
  const nameOf = (i) => { const e = D.t[i]; return typeof e === 'string' ? e : e[0]; };
  const slugOf = (i) => { const e = D.t[i]; return typeof e === 'string' ? e.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : e[1]; };
  let hlTerm = '';
  const hl = (t) => {
    if (!hlTerm) return escapeHtml(t);
    const lo = t.toLowerCase(); let out = ''; let p = 0; let k;
    while ((k = lo.indexOf(hlTerm, p)) !== -1) { out += escapeHtml(t.slice(p, k)) + '<mark class="oo-ix-hl">' + escapeHtml(t.slice(k, k + hlTerm.length)) + '</mark>'; p = k + hlTerm.length; }
    return out + escapeHtml(t.slice(p));
  };
  const rowHtml = (i) => {
    const n = D.c ? D.c[i] : 0;
    return '<li><a class="oo-ix-row" href="#/archive?type=tag&slug=' + encodeURIComponent(slugOf(i)) + '&label=' + encodeURIComponent(nameOf(i)) + '"><span>' + hl(nameOf(i)) + '</span>' + (n > 1 ? '<b>' + n + '</b>' : '') + '</a></li>';
  };
  const groups = {};
  const paint = (reset) => {
    if (reset) { list.innerHTML = ''; shown = 0; }
    const to = Math.min(shown + BATCH, arr.length);
    let h = '';
    for (let k = shown; k < to; k++) h += rowHtml(arr[k]);
    list.insertAdjacentHTML('beforeend', h);
    shown = to;
    const term = q.value.trim();
    stat.textContent = term
      ? fmt(arr.length) + (arr.length === 1 ? ' match' : ' matches') + ' across all topics' + (arr.length > shown ? '. Showing ' + fmt(shown) + '.' : '.')
      : cur ? 'Showing ' + fmt(shown) + ' of ' + fmt(arr.length) + ' topics under ' + lab(cur) + '.' : 'Showing ' + fmt(shown) + ' of ' + fmt(arr.length) + ' topics.';
    more.hidden = shown >= arr.length;
  };
  const run = () => {
    if (!D) return;
    const term = q.value.trim().toLowerCase();
    hlTerm = term;
    if (term) {
      arr = [];
      for (let i = 0; i < D.t.length; i++) if (nameOf(i).toLowerCase().indexOf(term) !== -1) arr.push(i);
      app.querySelectorAll('.oo-ix-l').forEach((b) => b.classList.remove('is-on'));
    } else {
      arr = cur === '' ? D.t.map((_, i) => i) : (groups[cur] || []);
      app.querySelectorAll('.oo-ix-l').forEach((b) => b.classList.toggle('is-on', b.getAttribute('data-l') === cur));
    }
    paint(true);
  };
  // Live from the website's own Index list (through the Worker); nothing is bundled or copied.
  const getIndex = () => fetch(WORKER_BASE + '/content/topic-index').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((d) => { if (!d || !Array.isArray(d.t)) throw new Error('bad'); return d; });
  getIndex()
    .then((d) => {
      if (token !== archiveToken) return;
      D = d;
      let k = 0;
      d.r.forEach(([L, n]) => { const g = groups[L] || (groups[L] = []); for (let c = 0; c < n; c++) g.push(k++); });
      app.querySelectorAll('.oo-ix-l').forEach((b) => { const l = b.getAttribute('data-l'); if (l !== '' && !groups[l]) b.classList.add('is-empty'); });
      run();
    })
    .catch(() => { stat.textContent = 'Could not load the index. Please try again.'; });
  app.querySelector('.oo-ix-az').addEventListener('click', (e) => {
    const b = e.target.closest('.oo-ix-l');
    if (!b || b.classList.contains('is-empty')) return;
    cur = b.getAttribute('data-l');
    q.value = '';
    run();
  });
  let tm = null;
  q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 160); });
  more.addEventListener('click', () => paint(false));
}

async function performSearch(term, statusEl, grid) {
  const statusTextEl = statusEl
    ? statusEl.querySelector('.search-status-text')
    : null;

  try {
    // Reset paging for new search term
    currentSearchTerm = term || '';
    currentSearchPage = 1;
    hasMoreSearchPages = true;
    isFetchingSearchResults = false;
    teardownSearchInfiniteScroll();

    // Always fetch first page explicitly
    const results = await fetchSearchResults(term, 1);
    if (!Array.isArray(results) || results.length === 0) {
      hasMoreSearchPages = false;
      statusEl.classList.remove('is-loading');
      if (statusTextEl) {
        statusTextEl.textContent = 'No results found.';
      }
      grid.innerHTML = '';
      return;
    }

    const frag = document.createDocumentFragment();
    let rendered = 0;

    results.forEach((post) => {
      if (hasExcludedCategory(post)) return;
      const card = createPostCard(post);
      frag.appendChild(card);
      rendered++;
    });

    if (rendered > 0) {
      grid.innerHTML = '';
      grid.appendChild(frag);

      statusEl.classList.remove('is-loading');
      if (statusTextEl) {
        statusTextEl.textContent =
          `${rendered} result${rendered === 1 ? '' : 's'} found.`;
      }

      // Enable infinite scroll ONLY if a full page came back
      if (rendered >= POSTS_PER_PAGE) {
        hasMoreSearchPages = true;
        setupSearchInfiniteScroll(grid);
      } else {
        hasMoreSearchPages = false;
        teardownSearchInfiniteScroll();
      }

      // If we came back from a search detail view, restore search scroll
      restoreSearchScroll(term);
    } else {
      hasMoreSearchPages = false;
      teardownSearchInfiniteScroll();
      statusEl.classList.remove('is-loading');
      if (statusTextEl) {
        statusTextEl.textContent =
          'No visible results (some posts may be filtered).';
      }
      grid.innerHTML = '';
    }

  } catch (err) {
    console.error('[OkObserver] Search error:', err);
    hasMoreSearchPages = false;
    teardownSearchInfiniteScroll();
    statusEl.classList.remove('is-loading');
    if (statusTextEl) {
      statusTextEl.textContent = 'An error occurred while searching.';
    }
    grid.innerHTML = '';
  }
}

  function escapeAttr(value) {
    if (!value) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
function sanitizeAuthorBioHtml(rawHtml) {
  try {
    if (!rawHtml) return '';

    // Parse + let the browser fix broken/misaligned tags
    const root = document.createElement('div');
    root.innerHTML = String(rawHtml);

    const ALLOWED = new Set(['A', 'STRONG', 'EM', 'B', 'I', 'BR', 'P']);

    // Snapshot all elements (TreeWalker live traversal can be tricky while mutating)
    const elements = Array.from(root.querySelectorAll('*'));

    for (const el of elements) {
      const tag = el.tagName;

      if (!ALLOWED.has(tag)) {
        // Replace disallowed tag with its text content
        const txt = document.createTextNode(el.textContent || '');
        el.replaceWith(txt);
        continue;
      }

      if (tag === 'A') {
        // Keep only safe href; force external-safe behavior
        const href = (el.getAttribute('href') || '').trim();
        const isSafe =
          href.startsWith('http://') ||
          href.startsWith('https://') ||
          href.startsWith('/');

        if (!isSafe) {
          // Strip unsafe link but keep readable text
          const txt = document.createTextNode(el.textContent || '');
          el.replaceWith(txt);
          continue;
        }

        // Remove all attributes first, then add back the safe ones
        const safeHref = href;
        for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);

        el.setAttribute('href', safeHref);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      } else {
        // For STRONG/EM/etc, remove all attributes
        for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
      }
    }

    // Convert newlines in text nodes to <br> (optional, helps when WP stores plain line breaks)
    // If you don't want this, you can delete this block.
    root.innerHTML = root.innerHTML.replace(/\n/g, '<br>');

    return root.innerHTML.trim();
  } catch (e) {
    // Fallback: treat as plain text if anything goes sideways
    return escapeHtml(String(rawHtml || '')).replace(/\n/g, '<br>');
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

  // ---------------------------------------------------------------------------
  // Post detail view
  // ---------------------------------------------------------------------------
  // Option A helper: render a fast “detail shell” from the clicked summary post
  function renderPostDetailShellFromSummary(summaryPost) {
    if (!summaryPost) return;

    const rawTitle =
      summaryPost.title && summaryPost.title.rendered
        ? summaryPost.title.rendered
        : '(Untitled)';

     const dateStr = formatDate(summaryPost.date);
    const authorName = getAuthorName(summaryPost);
    const metaParts = [];
if (authorName) {
  metaParts.push(escapeHtml(authorName));
}
    if (dateStr) metaParts.push(dateStr);
    const metaHtml = metaParts.length
      ? `<div class="post-meta">${metaParts.join(' • ')}</div>`
      : '';

    const featuredImageUrl = getFeaturedImageUrl(summaryPost);
    let heroHtml = '';
    if (featuredImageUrl) {
      const safeAlt = escapeAttr(stripHtml(rawTitle || ''));
      const cbJoin = featuredImageUrl.includes('?') ? '&' : '?';
      heroHtml = `
        <div class="post-hero">
          <img class="oo-media" src="${featuredImageUrl}${cbJoin}cb=${summaryPost.id}" alt="${safeAlt}" />
        </div>
      `;
    }

    // Use the excerpt as a placeholder body (fast paint), cleaned for logged-in users
    const excerptHtml = cleanExcerptForLoggedIn(
      summaryPost.excerpt && summaryPost.excerpt.rendered
        ? summaryPost.excerpt.rendered
        : ''
    );

    app.innerHTML = `
      <div class="post-detail oo-detail-prefill">
        <div class="oo-post-head"><h1 class="post-title">${rawTitle}</h1>
        ${metaHtml}<div class="oo-pn-arrows"><a class="oo-pn-a oo-pn-a-prev is-off" aria-label="Previous (newer) story" aria-disabled="true">&larr;</a><a class="oo-pn-a oo-pn-a-next is-off" aria-label="Next (older) story" aria-disabled="true">&rarr;</a></div></div>
        <div class="post-content post-detail-content entry-content">
          <div class="post-detail-tts-row">
            <button class="tts-button tts-button--placeholder" type="button" title="Listen" aria-label="Listen" disabled>🔊</button>
          </div>
          ${heroHtml}
          ${excerptHtml}
        </div>
        <button class="back-btn" type="button">Back to posts</button>
      </div>
    `;
    // Keep back button working even during shell
    const back = app.querySelector('.back-btn');
    if (back) {
      back.addEventListener('click', () => {
        const target =
          lastListHash && lastListHash !== '#/login' && lastListHash !== '#/logout'
            ? lastListHash
            : '#/';
        window.location.replace(target);
      });
    }
  }

    async function renderPostDetail(id) {
    stopTtsPlayback({ native: false });
    scrollToTop();

    // Option A: if we have the clicked summary post, paint a fast shell immediately
    const summary =
      lastClickedPostSummary && lastClickedPostSummary.id === id
        ? lastClickedPostSummary
        : null;
  // 🟢 INSTANT RENDER (this is the missing piece)
  if (summary) {
    renderPostDetailShellFromSummary(summary);
  }
    if (summary) {
      renderPostDetailShellFromSummary(summary);
    } else if (app.querySelector('.post-detail:not(.oo-detail-prefill)') || postCache.has(id)) {
      // Paging from one story to the next: keep the story on screen (softly faded) until the next one is ready,
      // instead of blanking the page and showing only the background.
      app.classList.add('oo-paging');
    } else {
      app.innerHTML = `
        <div class="post-detail-loading">
          <p>Loading article…</p>
        </div>
      `;
    }

    try {
      const post = await fetchPostById(id);
      app.classList.remove('oo-paging');
      renderPostDetailInner(post);
    } catch (err) {
      console.error('[OkObserver] Error loading post detail:', err);
      app.classList.remove('oo-paging');
      renderNotFound();
    }
  }


// Restricted story: swap the website's membership notice (WooCommerce Memberships text + product links) for the same
// invite the website shows - "There's more to the story." with Sign in / Subscribe. Returns null when the story is not restricted.
// The server alone decides what text is sent; this only changes how the notice looks, it never unlocks anything.
function ooInviteForRestricted(html, loggedIn) {
  if (!html || html.indexOf('wc-memberships') === -1) return null;
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const notice = tmp.querySelector('.wc-memberships-restriction-message, .wc-memberships-content-restricted-message, .wc-memberships-restrict');
    if (!notice) return null;
    let target = notice;
    while (target.parentElement && target.parentElement !== tmp &&
      (target.parentElement.textContent || '').replace(/\s+/g, ' ').trim() === (target.textContent || '').replace(/\s+/g, ' ').trim()) {
      target = target.parentElement;
    }
    const shop = (window.OO_SITE_ORIGIN || 'https://okobserver.org').replace(/\/+$/, '') + '/shop/';
    const invite = document.createElement('aside');
    invite.className = 'oo-invite';
    invite.setAttribute('aria-labelledby', 'oo-invite-h');
    invite.innerHTML = loggedIn
      ? `<h2 class="oo-invite-h" id="oo-invite-h">There’s more to the story.</h2>
         <p class="oo-invite-p">You’re signed in, but your account doesn’t include this story. Subscribe to support independent Oklahoma journalism.</p>
         <div class="oo-invite-actions"><a class="oo-invite-btn" href="${shop}" target="_blank" rel="noopener">Subscribe</a></div>`
      : `<h2 class="oo-invite-h" id="oo-invite-h">There’s more to the story.</h2>
         <p class="oo-invite-p">Sign in to keep reading—or subscribe to support independent Oklahoma journalism.</p>
         <div class="oo-invite-actions"><a class="oo-invite-btn oo-invite-btn--ghost oo-inline-login" href="#/login">Sign in</a><a class="oo-invite-btn" href="${shop}" target="_blank" rel="noopener">Subscribe</a></div>`;
    target.replaceWith(invite);
    return tmp.innerHTML;
  } catch (_) {
    return null;
  }
}

function removePaywallNoticeFromDetail(html) {
  if (!html) return html;

  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    const killPhrases = [
      'to access this content',
      'print only',
      'digital only',
      'total access'
    ];

    const nodes = tmp.querySelectorAll('p, div');
    nodes.forEach((el) => {
      const t = (el.textContent || '').toLowerCase();
      if (!t) return;

      const hasAccessLine = t.includes(killPhrases[0]);
      const planHits =
        (t.includes(killPhrases[1]) ? 1 : 0) +
        (t.includes(killPhrases[2]) ? 1 : 0) +
        (t.includes(killPhrases[3]) ? 1 : 0);

      if (hasAccessLine || planHits >= 2) {
        el.remove();
      }
    });

    return tmp.innerHTML;
  } catch (e) {
    return html;
  }
}
function linkifyPaywallLoginForSignedOut(html) {
  if (!html) return html;

  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    const isWpPaywallLoginHref = (href) => {
      if (!href) return false;
      const h = String(href).trim();
      return h.includes('my-account') && h.includes('wcm_redirect_to=post');
    };

    // 1) Rewrite WP-injected paywall login links ("log in" or "sign in") to SPA login.
    const links = Array.from(tmp.querySelectorAll('a'));
    for (const a of links) {
      const text = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const href = (a.getAttribute('href') || '').trim();

      if ((text === 'log in' || text === 'sign in') && isWpPaywallLoginHref(href)) {
        a.setAttribute('href', '#/login');
        a.removeAttribute('target');
        a.removeAttribute('rel');
        a.classList.add('oo-inline-login');
        return tmp.innerHTML;
      }
    }

    // 2) Plain-text fallback: if the words exist without a link, linkify them.
    // (Does not change any other content.)
    if (/\bsign in\b/i.test(html)) {
      return html.replace(/\bsign in\b/i, `<a href="#/login" class="oo-inline-login">sign in</a>`);
    }
    if (/\blog in\b/i.test(html)) {
      return html.replace(/\blog in\b/i, `<a href="#/login" class="oo-inline-login">log in</a>`);
    }

    return html;
  } catch (_) {
    // Safe fallback
    if (/\bsign in\b/i.test(html)) {
      return html.replace(/\bsign in\b/i, `<a href="#/login" class="oo-inline-login">sign in</a>`);
    }
    if (/\blog in\b/i.test(html)) {
      return html.replace(/\blog in\b/i, `<a href="#/login" class="oo-inline-login">log in</a>`);
    }
    return html;
  }
}
  // Option A helper: render a fast “prefill” detail view using the clicked summary post
  // This avoids a blank/jarring transition while the full post is fetched.
  // Previous / Next story links at the end of a post (older / newer, by date), like the website
async function loadPostNav(post) {
  const nav = app.querySelector('[data-post-nav]');
  if (!nav || !post || !post.date) return;
  // Like the website: neighbours skip the Cartoon category, "Next" is the OLDER story and "Previous" the NEWER one (the feed runs newest first)
  if (window.__ooCartoonCat === undefined) {
    try {
      const c = await fetchJson(`${WP_API_BASE}/categories?slug=cartoon&_fields=id`).catch(() => null);
      window.__ooCartoonCat = (Array.isArray(c) && c[0] && c[0].id) ? c[0].id : 0;
    } catch (_) { window.__ooCartoonCat = 0; }
  }
  // Magazine issues never show a post date, so their neighbour cards don't either
  if (window.__ooIssuesCat === undefined) {
    try {
      const c = await fetchJson(`${WP_API_BASE}/categories?slug=issues&_fields=id`).catch(() => null);
      window.__ooIssuesCat = (Array.isArray(c) && c[0] && c[0].id) ? c[0].id : 0;
    } catch (_) { window.__ooIssuesCat = 0; }
  }
  const exclude = window.__ooCartoonCat ? `&categories_exclude=${window.__ooCartoonCat}` : '';
  const q = (older) => `${WP_API_BASE}/posts?per_page=1&orderby=date&order=${older ? 'desc' : 'asc'}&${older ? 'before' : 'after'}=${encodeURIComponent(post.date)}${exclude}&_embed=wp:featuredmedia&_fields=id,title,date,categories,_links,_embedded`;
  try {
    const [older, newer] = await Promise.all([fetchJson(q(true)).catch(() => []), fetchJson(q(false)).catch(() => [])]);
    if (!document.body.contains(nav)) return;
    const link = (row, cls, dir) => {
      const r = Array.isArray(row) ? row[0] : null;
      if (!r || !r.id) return '';
      const title = stripHtml((r.title && r.title.rendered) || '');
      let img = '';
      try {
        const fm = r._embedded && r._embedded['wp:featuredmedia'] && r._embedded['wp:featuredmedia'][0];
        const sz = fm && fm.media_details && fm.media_details.sizes;
        const src = fm ? ((sz && ((sz.medium_large && sz.medium_large.source_url) || (sz.large && sz.large.source_url))) || fm.source_url) : '';
        if (src) img = '<span class="post-pn-media"><img src="' + escapeAttr(src) + '" alt="" loading="lazy" decoding="async" /></span>';
      } catch (_) {}
      const isIssue = window.__ooIssuesCat && Array.isArray(r.categories) && r.categories.indexOf(window.__ooIssuesCat) !== -1;
      const when = (r.date && !isIssue) ? '<span class="post-pn-date">' + escapeHtml(new Date(r.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })) + '</span>' : '';
      return '<a class="post-pn-link ' + cls + '" href="#/post/' + r.id + '"><span class="post-pn-dir">' + dir + '</span>' + img + '<span class="post-pn-title">' + escapeHtml(title) + '</span>' + when + '</a>';
    };
    const arrow = (row, sel) => {
      const a = app.querySelector(sel);
      const r = Array.isArray(row) ? row[0] : null;
      if (!a || !r || !r.id) return;
      a.href = '#/post/' + r.id;
      a.classList.remove('is-off');
      a.removeAttribute('aria-disabled');
    };
    arrow(newer, '.oo-pn-a-prev');
    arrow(older, '.oo-pn-a-next');
    let html = link(newer, 'post-pn-prev', 'Previous Article') + link(older, 'post-pn-next', 'Next Article');
    // Related coverage (like the website): a post sharing a tag, else a category, never the same as previous/next
    try {
      let tags = post.tags, cats = post.categories;
      if (!Array.isArray(tags) || !Array.isArray(cats)) {
        const p = await fetchJson(`${WP_API_BASE}/posts/${post.id}?_fields=tags,categories`).catch(() => null);
        if (p) { tags = p.tags; cats = p.categories; }
      }
      const skip = {};
      [older, newer].forEach((row) => { const r = Array.isArray(row) ? row[0] : null; if (r && r.id) skip[r.id] = 1; });
      const rq = (param, ids, before) => `${WP_API_BASE}/posts?per_page=3&exclude=${post.id}&${param}=${ids.join(',')}&orderby=date&order=${before ? 'desc' : 'asc'}&${before ? 'before' : 'after'}=${encodeURIComponent(post.date)}&_fields=id,title`;
      const pick = (rows) => { for (const row of rows) { const r = Array.isArray(row) ? row.find((x) => x && x.id && !skip[x.id]) : null; if (r) return r; } return null; };
      let rel = null;
      if (Array.isArray(tags) && tags.length) rel = pick(await Promise.all([fetchJson(rq('tags', tags, true)).catch(() => []), fetchJson(rq('tags', tags, false)).catch(() => [])]));
      if (!rel && Array.isArray(cats) && cats.length) rel = pick(await Promise.all([fetchJson(rq('categories', cats, true)).catch(() => []), fetchJson(rq('categories', cats, false)).catch(() => [])]));
      if (rel && document.body.contains(nav)) {
        html += '<a class="post-pn-related" href="#/post/' + rel.id + '"><span class="post-pn-dir">Related Coverage</span><span class="post-pn-title">' + escapeHtml(stripHtml((rel.title && rel.title.rendered) || '')) + '</span></a>';
      }
    } catch (_) {}
    if (!html) return;
    nav.innerHTML = html;
    nav.hidden = false;
  } catch (_) {}
}


  function renderPostDetailPrefillFromSummary(post) {
    if (!post) return;

    const rawTitle = post.title && post.title.rendered ? post.title.rendered : '(Untitled)';
    const titleHtml = rawTitle;

    const dateStr = formatDate(post.date);
    const authorName = getAuthorName(post);
    const metaParts = [];
if (authorName) {
  metaParts.push(escapeHtml(authorName));
}

    if (dateStr) metaParts.push(dateStr);
    const metaHtml = metaParts.length
      ? `<div class="post-meta">${metaParts.join(' • ')}</div>`
      : '';

    // Use the summary excerpt as temporary content (kept lightweight)
    const excerptHtml =
      post.excerpt && post.excerpt.rendered ? post.excerpt.rendered : '';
    const prefillContent = cleanExcerptForLoggedIn(excerptHtml);

    // Hero image (same logic as detail)
    let heroHtml = '';
    const featuredImageUrl = getFeaturedImageUrl(post);
    if (featuredImageUrl) {
      const safeAlt = escapeAttr(stripHtml(post.title && post.title.rendered ? post.title.rendered : ''));
      const cbJoin = featuredImageUrl.includes('?') ? '&' : '?';
      const heroImg = `<img class="oo-media" src="${featuredImageUrl}${cbJoin}cb=${post.id}" alt="${safeAlt}" />`;
      heroHtml = `<div class="post-hero">${heroImg}</div>`;
    }

    app.innerHTML = `
      <div class="post-detail oo-detail-prefill">
        <div class="oo-post-head"><h1 class="post-title">${titleHtml}</h1>
        ${metaHtml}<div class="oo-pn-arrows"><a class="oo-pn-a oo-pn-a-prev is-off" aria-label="Previous (newer) story" aria-disabled="true">&larr;</a><a class="oo-pn-a oo-pn-a-next is-off" aria-label="Next (older) story" aria-disabled="true">&rarr;</a></div></div>
        <div class="post-content post-detail-content entry-content">
          <div class="post-detail-tts-row">
            <button class="tts-button tts-button--placeholder" type="button" title="Listen" aria-label="Listen" disabled>🔊</button>
          </div>
          ${heroHtml}
          <div class="oo-detail-loading-inline" aria-live="polite">
            <span class="oo-loading-spinner" aria-hidden="true"></span>
            <span class="oo-loading-text">Loading…</span>
          </div>
          ${prefillContent}
        </div>
        <button class="back-btn" type="button">Back to News</button>
      </div>
    `;

    // Back button should work even during prefill
    const back = app.querySelector('.back-btn');
    if (back) {
      back.addEventListener('click', () => {
        const target =
          lastListHash && lastListHash !== '#/login' && lastListHash !== '#/logout'
            ? lastListHash
            : '#/';
        window.location.replace(target);
      });
    }
  }


    function renderPostDetailInner(post) {
  // --- FIX: prevent scroll restoration from hiding post tags ---
  window.scrollTo(0, 0);

    if (!post) {
      renderNotFound();
      return;
    }

    const rawTitle = post.title && post.title.rendered ? post.title.rendered : '(Untitled)';
    const titleHtml = rawTitle;
let contentHtml = post.content && post.content.rendered ? post.content.rendered : '';

{
  // QA task 17: restricted story (the website's membership notice came back in the text) -> the website's invite prompt
  const loggedInNow = !!(isClientLoggedIn && isClientLoggedIn());
  const invited = ooInviteForRestricted(contentHtml, loggedInNow);
  if (invited !== null) {
    contentHtml = invited;
  } else if (loggedInNow) {
    contentHtml = removePaywallNoticeFromDetail(contentHtml);
  } else {
    contentHtml = linkifyPaywallLoginForSignedOut(contentHtml);
  }
}



    const dateStr = formatDate(post.date);
    const authorName = getAuthorName(post);
    const metaParts = [];
if (authorName) {
  metaParts.push(escapeHtml(authorName));
}
    if (dateStr) metaParts.push(dateStr);
    const metaHtml = metaParts.length
      ? `<div class="post-meta">${metaParts.join(' • ')}</div>`
      : '';
// --- DETAIL TAGS/CATEGORIES (restore) ---
const cats = extractCategories(post) || [];
const tags = extractTags(post) || [];

const catNames = cats.map(c => (c && c.name ? String(c.name) : '')).filter(Boolean);
const tagNames = tags.map(t => (t && t.name ? String(t.name) : '')).filter(Boolean);

// Always show "Tags" (even if empty)
const tagsHtml = `<div class="post-tags" aria-label="Tags">
  ${
    tagNames.length
      ? tags.filter(t => t && t.name).map(t => `<a class="post-tag" href="${archiveHref('tag', t.id, String(t.name))}">${escapeHtml(String(t.name))}</a>`).join('')
      : ``
  }
</div>`;


// ✅ taxHtml is now initialized BEFORE the template uses it
const taxHtml = `<div class="post-tax">${tagsHtml}</div>`;
// --- AUTHOR BOX (bottom on detail) ---
const __author = post && post._embedded && Array.isArray(post._embedded.author)
  ? post._embedded.author[0]
  : null;

const __authorName = __author && __author.name ? String(__author.name) : '';
const __authorBioRaw = __author && __author.description ? String(__author.description) : '';
const __authorBio = __authorBioRaw.trim();

const __avatar =
  __author && __author.avatar_urls
    ? (__author.avatar_urls['96'] || __author.avatar_urls['48'] || __author.avatar_urls['24'] || '')
    : '';

let authorBoxHtml = '';
if (__authorName || __authorBio || __avatar) {
  const safeName = escapeHtml(__authorName || 'Author');
  const safeBio = __authorBio ? sanitizeAuthorBioHtml(__authorBio) : '';
  
  const safeAvatar = __avatar ? escapeAttr(__avatar) : '';

const nameHtml = __author && __author.id
  ? `<a class="author-box-name-link" href="${archiveHref('author', __author.id, __authorName)}">${safeName}</a>`
  : `<span class="author-box-name-link">${safeName}</span>`;


  authorBoxHtml = `
    <div class="author-box" aria-label="About the author">
      <div class="author-box-inner">
        ${safeAvatar ? `<img class="author-box-avatar" src="${safeAvatar}" alt="${safeName}" />` : ''}
        <div class="author-box-text">
          <div class="author-box-title">About the author</div>
          <div class="author-box-name">${nameHtml}</div>
          ${safeBio ? `<div class="author-box-bio">${safeBio}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

let heroHtml = '';
const featuredImageUrl = getFeaturedImageUrl(post);

// Prefer a meaningful link wrapped around an image in post content (NOT the image file itself).
const heroLinkRaw = extractHeroLinkFromContent(post);
const heroLink =
  heroLinkRaw && !/\.(jpe?g|png|gif|webp)$/i.test(heroLinkRaw)
    ? heroLinkRaw
    : null;

if (featuredImageUrl) {
  const safeAlt = escapeAttr(stripHtml(post.title.rendered || ''));
  const cbJoin = featuredImageUrl.includes('?') ? '&' : '?';
  const heroImg = `<img class="oo-media" src="${featuredImageUrl}${cbJoin}cb=${post.id}" alt="${safeAlt}" />`;

  const isFacebookHeroLink =
  !!heroLink && /(facebook\.com|m\.facebook\.com|fb\.watch)\//i.test(heroLink);

heroHtml = heroLink
  ? `<a class="post-hero-link${isFacebookHeroLink ? ' post-hero-facebook' : ''}"
        href="${heroLink}" target="_blank" rel="noopener">
        ${heroImg}
        ${isFacebookHeroLink ? `<span class="fb-watch-overlay" aria-label="Watch on Facebook">Watch on Facebook</span>` : ''}
     </a>`
  : `<div class="post-hero">${heroImg}</div>`;

}


const ttsButtonHtml = `
  <button class="oo-act oo-act-sq" type="button" data-act="back" aria-label="Back" title="Back">&larr;</button>
  <button class="oo-act oo-act-sq" type="button" data-act="theme" aria-label="Switch light or dark mode" title="Light / dark mode">&#9680;</button>
  <button class="tts-button" type="button" title="Listen" aria-label="Listen">🔊</button>
  <button class="oo-act" type="button" data-act="share" title="Share">${ICON_SHARE}<span class="lbl">Share</span></button>
  <span class="oo-act-group" role="group" aria-label="Reading size">
    <button class="oo-act oo-act-pm" type="button" data-act="textpm" aria-label="Text size: minus is smaller, plus is larger" title="Text size"><span aria-hidden="true">&minus;</span><i aria-hidden="true"></i><span aria-hidden="true">+</span></button>
  </span>
`;

const headBg = featuredImageUrl ? ` style="--oo-hd:url('${String(featuredImageUrl).replace(/'/g, '%27')}')"` : '';
const detailInnerHtml = `
  <div class="oo-post-head"${headBg}>
  <h1 class="post-title">${titleHtml}</h1>
  ${metaHtml}
  <div class="oo-pn-arrows"><a class="oo-pn-a oo-pn-a-prev is-off" aria-label="Previous (newer) story" aria-disabled="true">&larr;</a><a class="oo-pn-a oo-pn-a-next is-off" aria-label="Next (older) story" aria-disabled="true">&rarr;</a></div>
  </div>
  <div class="post-content post-detail-content entry-content">
<div class="post-detail-tts-row">
      ${ttsButtonHtml}
    </div>
    ${heroHtml}
    ${contentHtml}
    </div>
  ${taxHtml}
  ${authorBoxHtml}
  <section class="oo-comments" data-oo-comments="${post.id}" hidden></section>
  <nav class="post-pn" data-post-nav aria-label="More stories" hidden></nav>
  <button class="back-btn" type="button">Back to News</button>
`;

const existingPrefill = app.querySelector('.post-detail.oo-detail-prefill');

if (existingPrefill) {
  // Fast path: keep the already-painted shell node and hydrate it in place.
  existingPrefill.classList.remove('oo-detail-prefill');
  existingPrefill.innerHTML = detailInnerHtml;
} else {
  // Fallback for deep links / no prefill shell
  app.innerHTML = `
    <div class="post-detail">
      ${detailInnerHtml}
    </div>
  `;
}

loadPostNav(post);
try { ooLoadComments(post); } catch (_) {}
try { ooFitPostTitle(); requestAnimationFrame(ooFitPostTitle); } catch (_) {}

scrollToTop();

    const back = app.querySelector('.back-btn');
    if (back) {
      back.addEventListener('click', () => {
        // If user came from a grid view (home or search),
        // Return to last grid/search view safely (no auth routes in history)
        if (homeState.initialized || searchState.initialized || /^#\/(archive|browse|saved|following|events)/.test(lastListHash || '')) {
        const target =
  lastListHash && lastListHash !== '#/login' && lastListHash !== '#/logout'
    ? lastListHash
    : '#/';

window.location.replace(target);
        } else {
          // Deep-linked directly to a post
          window.location.replace('#/');

        }
      });
    }

    // Share / reading size
    const shareBtn = app.querySelector('.oo-act[data-act="share"]');
    if (shareBtn) shareBtn.addEventListener('click', () => sharePost(post));
    const backBar = app.querySelector('.oo-act[data-act="back"]');
    if (backBar) backBar.addEventListener('click', () => { const bb = app.querySelector('.back-btn'); if (bb) bb.click(); });
    const readTools = app.querySelector('.oo-act-group');
    if (readTools) readTools.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-act]');
      if (!b) return;
      const a = b.getAttribute('data-act');
      if (a === 'textpm') {
        const rc = b.getBoundingClientRect();
        stepReader(e.clientX < rc.left + rc.width / 2 ? -1 : 1);
      }
    });
    // Light / dark button (sits beside Back, outside the text-size group)
    const themeBtn = app.querySelector('.oo-act[data-act="theme"]');
    if (themeBtn) themeBtn.addEventListener('click', () => {
      const root = document.documentElement;
      const next = root.getAttribute('data-oo-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-oo-theme', next);
      try { localStorage.setItem('ooTheme', next); } catch (err) {}
      toast(next === 'light' ? 'Light mode' : 'Dark mode');
    });

    // Tapping anywhere other than the speaker button stops the reading.
    if (!window.__okobsTtsOutsideStop) {
      window.__okobsTtsOutsideStop = true;
      document.addEventListener('click', (e) => {
        if (!currentTtsPostId) return;
        if (e.target && e.target.closest && e.target.closest('.tts-button, .oo-listen-box')) return;
        stopTtsPlayback({ native: true });
      }, true);
    }

     const ttsButton = app.querySelector('.tts-button');
    if (ttsButton) {
      ttsButton.addEventListener('click', () => {
        const current = currentTtsPostId;
        const thisId = post.id;
        if (current && current === thisId) {
          stopTtsPlayback({ native: true });
        } else {
          const text = buildTtsTextFromHtml(contentHtml);
          speakChunksSequentially(text, thisId);
          showListenBox();
        }
      });
    }

        // Let the full article paint first on mobile, then do heavier embed work.
    requestAnimationFrame(() => {
      setTimeout(() => {
        // Insert top-of-article embeds (YouTube/Vimeo/Facebook, overrides, etc.)
        enhanceEmbedsInDetail(post);

        // NEW: fix any lazy-loaded iframes (data-lazy-src → src) so the players actually render
        removeLazyloadEmbeds();
      }, 0);
    });
  }

  function enhanceEmbedsInDetail(post) {
    const container = app.querySelector('.post-detail-content');
    if (!container || !post) return;

    const html = container.innerHTML || '';
    if (!html) return;

 

   // Hard overrides for posts whose embeds are too weird to parse reliably
  const videoOverrides = {
    '383136': 'https://player.vimeo.com/video/1137090361',
    "381733": "https://player.vimeo.com/video/1126193804",
    '374604': 'https://player.vimeo.com/video/1126193804',

    // Added 2025-12-10 — explicit Vimeo override for post 372002
    // This stabilizes a non-standard Vimeo link the regex cannot extract.
    '372002': 'https://player.vimeo.com/video/1093051934?dnt=1&app_id=122963',

    // Added 2025-12-10 — explicit Vimeo override for Sept ’19 Newsmakers (post 38883)
    '38883': 'https://player.vimeo.com/video/360644361'
  };


  const overrideSrc = videoOverrides[post.id];
  if (overrideSrc) {
    console.log('[OkObserver debug] Using videoOverrides for post', post.id, overrideSrc);

    // REMOVE all existing iframes first — they include the broken WP Vimeo embed
    container.querySelectorAll('iframe').forEach(el => el.remove());

    // Create the same wrapper we use for auto-detected embeds
    const wrapper = document.createElement('div');
    wrapper.className = 'video-embed-wrapper';

    const iframe = document.createElement('iframe');
    iframe.src = overrideSrc;
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('frameborder', '0');
    iframe.className = 'video-embed video-embed-vimeo';

    wrapper.appendChild(iframe);

    // Insert wrapper after the TTS row so the article text does not jump vertically
    const ttsRow = container.querySelector('.post-detail-tts-row');
    if (ttsRow && ttsRow.parentNode === container) {
      ttsRow.insertAdjacentElement('afterend', wrapper);
    } else {
      container.insertBefore(wrapper, container.firstChild);
    }

    return;
  }


    // Otherwise, try to detect embeds from the post HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    let videoEmbedHtml = '';

    // 1) Direct iframe (classic WP and many block themes)
    const iframeEl = tmp.querySelector('iframe');
    if (iframeEl) {
      videoEmbedHtml = iframeEl.outerHTML;
    } else {
      // 2) HTML5 <video> tag (Gutenberg video blocks, etc.)
      const videoEl = tmp.querySelector('video');
      if (videoEl) {
        videoEmbedHtml = videoEl.outerHTML;
      } else {
        // 3) Links that point to video providers
        const links = tmp.querySelectorAll('a');
        for (const a of links) {
          const href = a.getAttribute('href') || '';
          const text = (a.textContent || '').trim().toLowerCase();

          // YouTube: standard watch or youtu.be links
          if (/youtube\.com\/watch\?v=/.test(href) || /youtu\.be\//.test(href)) {
            videoEmbedHtml = buildYouTubeEmbedFromUrl(href);
            break;
          }

          // Vimeo: handle vimeo.com/123456789 and vimeo.com/123456789?share=copy, etc.
          if (href.includes('vimeo.com')) {
             const idMatch = href.match(/vimeo\.com\/(?:.*\/)?(\d{6,12})(?:\D|$)/);


            if (idMatch && idMatch[1]) {
              videoEmbedHtml = `
                <iframe
                  class="video-embed video-embed-vimeo"
                  src="https://player.vimeo.com/video/${idMatch[1]}"
                  frameborder="0"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowfullscreen
                ></iframe>
              `;
              // We definitely have a playable Vimeo ID now.
              break;
            }
            // If href has vimeo.com but regex fails, DO NOT break.
            // Keep scanning other links (like "Click here to listen in").
          }

          // Special case: "Click here to listen in" pointing at Vimeo, even if href is weird
          if (!videoEmbedHtml &&
              text.includes('click here to listen in') &&
              href.includes('vimeo.com')) {
            const candidate = buildVimeoEmbedFromUrl(href);
            if (candidate) {
              videoEmbedHtml = candidate;
              break;
            }
          }

          // Facebook: use "Watch on Facebook" overlay instead of embedding
          if (/facebook\.com\/.*\/videos\//.test(href)) {
            addFacebookWatchOverlay(href);
            // No embedded Facebook iframe; overlay only.
            break;
          }
        }

        // 4) Plain-text URLs inside the HTML (like 381733, 377530, etc.)
        if (!videoEmbedHtml) {
          const htmlText = html;

          // Look for any bare Vimeo, YouTube or Facebook URL in the HTML.
            const vimeoMatch = htmlText.match(
            /https?:\/\/(?:www\.)?vimeo\.com\/(?:.*\/)?(\d{6,12})(?:\D|$)/
          );

          const ytMatch = htmlText.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[^"'<\s]+|youtu\.be\/[A-Za-z0-9_-]+)/);
          const fbMatch = htmlText.match(/https?:\/\/(?:www\.)?facebook\.com\/[^"'<\s]+\/videos\/\d+/);

          const urlMatch = vimeoMatch || ytMatch || fbMatch;
          if (urlMatch) {
            const url = urlMatch[0];

            if (vimeoMatch && vimeoMatch[1]) {
              // Build Vimeo embed directly from the captured ID
              const id = vimeoMatch[1];
              videoEmbedHtml = `
                <iframe
                  class="video-embed video-embed-vimeo"
                  src="https://player.vimeo.com/video/${id}"
                  frameborder="0"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowfullscreen
                ></iframe>
              `;
            } else if (ytMatch) {
              videoEmbedHtml = buildYouTubeEmbedFromUrl(url);
            } else if (fbMatch) {
              // Again: overlay only, no embedded Facebook player.
              addFacebookWatchOverlay(url);
            }
          }
        }
      }
    }


    // FINAL safety net: scan the raw HTML string for any Vimeo URL,
    // even if it has ?share=copy, fbclid, etc., and turn it into a player.
    if (!videoEmbedHtml) {
      const rawVimeo = html.match(
  /https?:\/\/[^"'<\s]*vimeo\.com\/(?:.*\/)?(\d{6,12})(?:\D|$)/i
);

      if (rawVimeo && rawVimeo[1]) {
        const vimeoId = rawVimeo[1];
        videoEmbedHtml = `
          <iframe
            class="video-embed video-embed-vimeo"
            src="https://player.vimeo.com/video/${vimeoId}"
            frameborder="0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowfullscreen
          ></iframe>
        `;
      }
    }


        if (videoEmbedHtml) {
      const wrapperHtml = `
        <div class="video-embed-wrapper">
          ${videoEmbedHtml}
        </div>
      `;

      // Insert after the TTS row so the top text position stays stable
      const ttsRow = container.querySelector('.post-detail-tts-row');
      if (ttsRow && ttsRow.parentNode === container) {
        ttsRow.insertAdjacentHTML('afterend', wrapperHtml);
      } else {
        container.insertAdjacentHTML('afterbegin', wrapperHtml);
      }
    }

    // After inserting embeds, remove stray empty paragraphs that
    // only add vertical white space under the player.
    const paragraphs = container.querySelectorAll('p');
    paragraphs.forEach((p) => {
      const hasMediaChild = p.querySelector('img, iframe, video, figure');
      if (!hasMediaChild && !p.textContent.trim()) {
        p.remove();
      }
    });
  }


  function buildYouTubeEmbedFromUrl(url) {
    try {
      const u = new URL(url);
      let videoId = '';
      if (u.hostname.includes('youtu.be')) {
        videoId = u.pathname.replace('/', '');
      } else {
        videoId = u.searchParams.get('v') || '';
      }
      if (!videoId) return '';
      return `
        <iframe
          class="video-embed video-embed-youtube"
          src="https://www.youtube.com/embed/${videoId}"
          title="YouTube video player"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      `;
    } catch (e) {
      console.warn('[OkObserver] Unable to parse YouTube URL:', url, e);
      return '';
    }
  }

  function buildVimeoEmbedFromUrl(url) {
    const match = url.match(/vimeo\.com\/(\d+)/);
    const videoId = match && match[1];
    if (!videoId) return '';
    return `
      <iframe
        class="video-embed video-embed-vimeo"
        src="https://player.vimeo.com/video/${videoId}"
        frameborder="0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowfullscreen
      ></iframe>
    `;
  }

  function buildFacebookEmbedFromUrl(url) {
    const enc = encodeURIComponent(url);
    return `
      <iframe
        class="video-embed video-embed-facebook"
        src="https://www.facebook.com/plugins/video.php?href=${enc}&show_text=0"
        frameborder="0"
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    `;
  }

  function addFacebookWatchOverlay(url) {
    try {
      const hero = document.querySelector('.post-hero, .post-detail-hero');
      if (!hero) return;

      // Avoid duplicates if we re-render
      if (hero.querySelector('.fb-watch-overlay')) return;

      // Ensure hero can host absolutely positioned children
      const currentPosition = window.getComputedStyle(hero).position;
      if (!currentPosition || currentPosition === 'static') {
        hero.style.position = 'relative';
      }

      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'fb-watch-overlay';
      link.textContent = 'Watch on Facebook';

      hero.appendChild(link);

      // Remove any existing Facebook iframes from the article content
      const fbIframes = document.querySelectorAll(
        '.post-detail-content iframe[src*="facebook.com"], ' +
        '.post-detail-content iframe[data-lazy-src*="facebook.com"]'
      );
      fbIframes.forEach((el) => el.remove());
    } catch (err) {
      console.warn('[OkObserver] Failed to add Facebook watch overlay', err);
    }
  }
  // ---------------------------------------------------------------------------
  // Auth helpers (login via Cloudflare Worker)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Read-only comments (no posting in the app). Loaded lazily, only when the section nears the screen;
  // the list itself (and avatars) is only built when the reader taps to open it.
  // ---------------------------------------------------------------------------
  const ooCommentsCache = new Map();

  function ooCleanCommentHtml(html) {
    const doc = new DOMParser().parseFromString('<div>' + String(html || '') + '</div>', 'text/html');
    const keep = { P: 1, BR: 1, A: 1, EM: 1, I: 1, STRONG: 1, B: 1, BLOCKQUOTE: 1, UL: 1, OL: 1, LI: 1 };
    (function walk(node) {
      Array.from(node.childNodes).forEach((ch) => {
        if (ch.nodeType === 8) { ch.remove(); return; }
        if (ch.nodeType !== 1) return;
        walk(ch);
        if (!keep[ch.tagName]) {
          if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|INPUT|BUTTON|SVG|IMG|VIDEO|AUDIO)$/.test(ch.tagName)) { ch.remove(); return; }
          while (ch.firstChild) ch.parentNode.insertBefore(ch.firstChild, ch);
          ch.remove();
          return;
        }
        Array.from(ch.attributes).forEach((a) => {
          if (!(ch.tagName === 'A' && a.name === 'href')) ch.removeAttribute(a.name);
        });
        if (ch.tagName === 'A') {
          const h = ch.getAttribute('href') || '';
          if (!/^https?:\/\//i.test(h)) { ch.removeAttribute('href'); }
          else { ch.setAttribute('target', '_blank'); ch.setAttribute('rel', 'nofollow noopener'); }
        }
      });
    })(doc.body.firstChild);
    return doc.body.firstChild.innerHTML;
  }

  function ooCommentsListHtml(list) {
    const byParent = {};
    list.forEach((c) => { (byParent[c.parent || 0] = byParent[c.parent || 0] || []).push(c); });
    const ids = {};
    list.forEach((c) => { ids[c.id] = 1; });
    // a reply whose parent was not returned is shown at top level
    list.forEach((c) => { if (c.parent && !ids[c.parent]) { (byParent[0] = byParent[0] || []).push(c); } });
    const one = (c, depth) => {
      const name = (function () { const t = document.createElement('textarea'); t.innerHTML = String(c.author_name || 'Reader'); return t.value; })();
      const av = c.author_avatar_urls && (c.author_avatar_urls['48'] || c.author_avatar_urls['24']) || '';
      let when = '';
      try { when = new Date(c.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); } catch (_) {}
      const kids = (byParent[c.id] || []).map((k) => one(k, depth + 1)).join('');
      return '<li class="oo-comment" data-depth="' + Math.min(depth, 3) + '">' +
        '<div class="oo-comment-head">' +
        (av ? '<img class="oo-comment-av" src="' + escapeAttr(av) + '" alt="" width="40" height="40" loading="lazy" decoding="async" />' : '<span class="oo-comment-av oo-comment-av-ph" aria-hidden="true"></span>') +
        '<div class="oo-comment-who"><strong>' + escapeHtml(name) + '</strong><span>' + escapeHtml(when) + '</span></div></div>' +
        '<div class="oo-comment-body">' + ooCleanCommentHtml(c.content && c.content.rendered) + '</div>' +
        (kids ? '<ol class="oo-comment-replies">' + kids + '</ol>' : '') +
        '</li>';
    };
    return '<ol class="oo-comment-list">' + (byParent[0] || []).map((c) => one(c, 0)).join('') + '</ol>';
  }

  async function ooFetchComments(postId) {
    if (ooCommentsCache.has(postId)) return ooCommentsCache.get(postId);
    const all = [];
    for (let page = 1; page <= 3; page++) {
      const u = new URL(WP_API_BASE);
      u.pathname = '/wp-json/wp/v2/comments';
      u.search = '?post=' + encodeURIComponent(postId) + '&per_page=100&page=' + page + '&orderby=date&order=asc&_fields=id,parent,author_name,date,content,author_avatar_urls';
      let part;
      try { part = await fetchJson(u.toString(), {}); } catch (_) { part = null; }
      if (!Array.isArray(part)) break;
      all.push(...part);
      if (part.length < 100) break;
    }
    ooCommentsCache.set(postId, all);
    return all;
  }

  function ooLoadComments(post) {
    const host = app.querySelector('[data-oo-comments="' + post.id + '"]');
    if (!host) return;
    const start = async () => {
      if (!host.isConnected) return;
      // gated stories: the teaser block is showing, so do not show comments either
      if (app.querySelector('.oo-invite') || app.querySelector('.oo-paywall-notice')) return;
      const list = await ooFetchComments(post.id);
      if (!host.isConnected) return;
      host.hidden = false;
      host.innerHTML =
        '<button class="oo-comments-toggle" type="button" aria-expanded="false">' +
        '<span>Comments (' + list.length + ')</span><i aria-hidden="true">+</i></button>' +
        '<div class="oo-comments-panel" hidden></div>';
      const btn = host.querySelector('.oo-comments-toggle');
      const panel = host.querySelector('.oo-comments-panel');
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.querySelector('i').textContent = open ? '\u2212' : '+';
        if (open && !panel.dataset.built) {
          const reply = /^https?:\/\//i.test(post.link || '') ? '<p class="oo-comments-reply"><a href="' + escapeAttr(String(post.link).split('#')[0] + '#respond') + '" target="_blank" rel="noopener">Leave a reply on okobserver.org</a></p>' : '';
          panel.innerHTML = (list.length ? ooCommentsListHtml(list) : '<p class="oo-comments-empty">No comments yet. Be the first to join the conversation.</p>') + reply;
          panel.dataset.built = '1';
        }
        panel.hidden = !open;
      });
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
      }, { rootMargin: '800px 0px' });
      // the section is hidden until it has content, so watch the author box / tags area instead
      const anchor = host.previousElementSibling || host;
      io.observe(anchor);
    } else {
      start();
    }
  }

  // Fixed-height title box (same idea as the website): the box is always the same height, the title shrinks to fit.
  function ooFitPostTitle() {
    const head = app.querySelector(".oo-post-head");
    const h1 = head && head.querySelector(".post-title");
    if (!head || !h1) return;
    const meta = head.querySelector(".post-meta");
    h1.style.fontSize = "";
    const hs = getComputedStyle(head), ts = getComputedStyle(h1);
    const max = window.innerWidth >= 700 ? 46 : 42; // short titles grow up to this, long ones shrink to fit
    const inner = head.clientHeight - (parseFloat(hs.paddingTop) || 0) - (parseFloat(hs.paddingBottom) || 0);
    let used = (parseFloat(ts.marginTop) || 0) + (parseFloat(ts.marginBottom) || 0);
    if (meta) { const ms = getComputedStyle(meta); used += meta.offsetHeight + (parseFloat(ms.marginTop) || 0) + (parseFloat(ms.marginBottom) || 0); }
    const room = inner - used;
    let size = max;
    h1.style.fontSize = size + "px";
    while (size > 17 && h1.getBoundingClientRect().height > room) { size -= 1; h1.style.fontSize = size + "px"; }
  }
  window.addEventListener("resize", () => { try { ooFitPostTitle(); } catch (_) {} });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { try { ooFitPostTitle(); } catch (_) {} });

  async function loginUser(username, password) {
    try {
      const resp = await fetch(
        'https://okobserver-proxy.bob-b5c.workers.dev/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ username, password })
        }
      );

      const data = await resp.json().catch(() => null);

      if (!resp.ok || !data || !data.success) {
        console.warn('[OkObserver] Login failed response:', data);
        try {
          const raw = (data && data.message) ? String(data.message) : ('Server answered ' + resp.status + '.');
          window.__ooLoginErr = raw.replace(/<[^>]*>/g, '').replace(/^s*(error:)s*/i, '').slice(0, 160);
        } catch (_) {}
        return false;
      }

console.info(
  '[OkObserver] Login successful for:',
  (data.user && (data.user.email || data.user.name)) || username
);

// ✅ persist logged-in state for authenticated fetches
try {
  localStorage.setItem('ooLoggedIn', '1');
  if (data.token) {
    localStorage.setItem('ooJwt', data.token);
  }
} catch (_) {}

return true;

    } catch (err) {
      console.error('[OkObserver] Login error:', err);
      try { window.__ooLoginErr = 'Could not reach the sign-in service (' + ((err && err.message) || 'network error') + ').'; } catch (_) {}
      return false;
    }
  }
async function logoutUser() {
  try {
    await fetch('https://okobserver-proxy.bob-b5c.workers.dev/auth/logout', {
  method: 'POST',
  credentials: 'include'
});

    return true;
  } catch (e) {
    console.warn('[auth] logout failed', e);
    return false;
  }
}

  // ---------------------------------------------------------------------------
  // Login view (new)
  // ---------------------------------------------------------------------------

  function renderLogin() {
    stopTtsPlayback();
    scrollToTop();

    app.innerHTML = `
      <div class="login-view">
        <h1 class="login-title">Member Login</h1>

        <form class="login-form" novalidate>
          <label class="login-label">
            <span class="login-label-text">Email or Username</span>
            <input class="login-input" type="text" name="username" required />
          </label>

          <label class="login-label">
            <span class="login-label-text">Password</span>
            <div class="login-password-wrap">
  <input class="login-input" id="ooLoginPassword" type="password" name="password" required autocomplete="current-password" />
  <button class="login-password-toggle" type="button" aria-label="Show password" aria-pressed="false" aria-controls="ooLoginPassword">👁</button>
</div>
          </label>

          <button class="login-submit" type="submit">Sign In</button>

          <div class="login-error" aria-live="polite"></div>
        </form>
      </div>
    `;

    const form = app.querySelector(".login-form");
    const errorBox = app.querySelector(".login-error");
// Password peek (eye toggle)
const pwInput = app.querySelector("#ooLoginPassword");
const pwToggle = app.querySelector(".login-password-toggle");

if (pwInput && pwToggle) {
  pwToggle.addEventListener("click", () => {
    const showing = pwInput.type === "text";
    pwInput.type = showing ? "password" : "text";

    pwToggle.setAttribute("aria-pressed", String(!showing));
    pwToggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    pwToggle.textContent = showing ? "👁" : "🙈";

    // Keep focus in the field for usability
    pwInput.focus({ preventScroll: true });
    try { pwInput.setSelectionRange(pwInput.value.length, pwInput.value.length); } catch (_) {}
  });
}

    form.addEventListener("submit", async (evt) => {
      evt.preventDefault();
      errorBox.textContent = "";

      const formData = new FormData(form);
      const username = formData.get("username")?.trim();
      const password = formData.get("password");

      if (!username || !String(password || "").length) {
        errorBox.textContent = "Please enter both username and password.";
        return;
      }

      try {
                const ok = await loginUser(username, password);
        if (ok) {
          try { localStorage.setItem('ooLoggedIn', '1'); } catch (_) {}
          try { document.body.classList.add('oo-logged-in'); } catch (_) {}

          // IMPORTANT: throw away any paywalled/teaser post responses cached before login
          try { postCache.clear(); } catch (_) {}
          homeState.initialized = false;
          searchState.initialized = false;
          updateAuthNav();
          window.location.replace(lastNonLoginHash || "#/");
        } else {
          errorBox.textContent = "Invalid login. Please try again." + (window.__ooLoginErr ? " (" + window.__ooLoginErr + ")" : "");
        }


      } catch (err) {
        console.error("Login error:", err);
        errorBox.textContent = "Unable to login. Please try again later.";
      }
    });
  }
function renderLogout() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="logout-wrap">
      <h1>Sign out</h1>
      <p>You’ll be signed out on this device. You can sign back in anytime.</p>
      <div class="logout-actions">
        <button id="btnConfirmLogout" class="btnPrimary">Sign out</button>
        <button id="btnCancelLogout" class="btnSecondary">Stay signed in</button>
      </div>
      <div id="logoutMsg" class="login-msg" aria-live="polite"></div>
    </div>
  `;

  const msgEl = document.getElementById('logoutMsg');
  const btnCancel = document.getElementById('btnCancelLogout');
  const btnConfirm = document.getElementById('btnConfirmLogout');
  let busy = false;

  btnCancel?.addEventListener('click', () => {
    if (busy) return;
    window.location.replace(lastNonLoginHash || '#/');
  });

  btnConfirm?.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    if (btnCancel) btnCancel.disabled = true;
    if (btnConfirm) btnConfirm.disabled = true;

    if (msgEl) msgEl.textContent = 'Signing out…';

    const ok = await logoutUser();
    try { localStorage.removeItem('ooLoggedIn'); localStorage.removeItem('ooJwt'); } catch (_) {}
    updateAuthNav();
// Clear any cached authenticated content so UI cannot look logged-in
try { postCache.clear(); } catch (_) {}
try { document.body.classList.remove('oo-logged-in'); } catch (_) {}

    if (msgEl) msgEl.textContent =
      ok ? 'Signed out.' : 'Sign out failed (you may already be signed out).';

    setTimeout(() => window.location.replace(lastNonLoginHash || '#/'), 450);
  });
}


  // ---------------------------------------------------------------------------
  // Not found view
  // ---------------------------------------------------------------------------

function renderNotFound() {
    scrollToTop();
    app.innerHTML = `
      <div class="not-found-view">
        <h1>Not found</h1>
        <p>We couldn’t find that page. Please return to the latest news.</p>
        <button class="back-btn" type="button">Back to News</button>
      </div>
    `;
    const back = app.querySelector('.back-btn');
    if (back) {
      back.addEventListener('click', () => {
        window.location.replace('#/');

      });
    }
  }


  
    // ---------------------------------------------------------------------------
  // Search Infinite Scroll Helpers (added 2025-12-10, Option C inside-IIFE)
  // ---------------------------------------------------------------------------

  function teardownSearchInfiniteScroll() {
    if (searchObserver) {
      searchObserver.disconnect();
      searchObserver = null;
    }
    if (searchScrollLoadTimeout) {
      clearTimeout(searchScrollLoadTimeout);
      searchScrollLoadTimeout = null;
    }
    const sentinel = document.querySelector('.search-scroll-sentinel');
    if (sentinel && sentinel.parentNode) {
      sentinel.parentNode.removeChild(sentinel);
    }
  }

  function setupSearchInfiniteScroll(grid) {
    teardownSearchInfiniteScroll();

    if (!currentSearchTerm) return;

    const sentinel = document.createElement('div');
    sentinel.className = 'search-scroll-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    grid.insertAdjacentElement('afterend', sentinel);

    searchObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= SCROLL_SENTRY_OFFSET) {
            requestMoreSearchResults();
          }
        }
      },
      {
        root: null,
        threshold: [SCROLL_SENTRY_OFFSET],
      }
    );

    searchObserver.observe(sentinel);
  }

  function requestMoreSearchResults() {
    if (isFetchingSearchResults || !hasMoreSearchPages) return;
    if (searchScrollLoadTimeout) {
      clearTimeout(searchScrollLoadTimeout);
    }
    searchScrollLoadTimeout = setTimeout(() => {
      if (!isFetchingSearchResults && hasMoreSearchPages) {
        loadMoreSearchResults();
      }
    }, 120);
  }

  async function loadMoreSearchResults() {
    if (isFetchingSearchResults || !hasMoreSearchPages || !currentSearchTerm) {
      return;
    }

    isFetchingSearchResults = true;
showPagingStatus('Loading more…');


    const view = document.querySelector('.search-view');
    if (!view) {
      hidePagingStatus();
      isFetchingSearchResults = false;
      return;
    }

    const grid = view.querySelector('.search-grid');
    const statusEl = view.querySelector('.search-status');
    if (!grid || !statusEl) {
      hidePagingStatus();
      isFetchingSearchResults = false;
      return;
    }

    try {
      const nextPage = currentSearchPage + 1;
      console.debug('[OkObserver] Fetching search page', nextPage, 'for term', currentSearchTerm);

      const results = await fetchSearchResults(currentSearchTerm, nextPage);
      if (!Array.isArray(results) || results.length === 0) {
        hasMoreSearchPages = false;
        teardownSearchInfiniteScroll();
        hidePagingStatus();
        return;
      }

      const frag = document.createDocumentFragment();
      let appended = 0;

      for (const post of results) {
        if (hasExcludedCategory(post)) continue;
        const card = createPostCard(post);
        frag.appendChild(card);
        appended++;
      }

      if (appended > 0) {
        grid.appendChild(frag);

        const total = grid.querySelectorAll('.post-card').length;
        const statusTextEl = statusEl.querySelector('.search-status-text');
        if (statusTextEl) {
          statusTextEl.textContent = `${total} result${total === 1 ? '' : 's'} loaded.`;
        } else {
          statusEl.textContent = `${total} result${total === 1 ? '' : 's'} loaded.`;
        }

        currentSearchPage = nextPage;

        if (appended < POSTS_PER_PAGE) {
          hasMoreSearchPages = false;
          teardownSearchInfiniteScroll();
        }
      } else {
        hasMoreSearchPages = false;
        teardownSearchInfiniteScroll();
      }

      hidePagingStatus();
    } catch (err) {
      console.error('[OkObserver] Error loading more search results:', err);
      hidePagingStatus();
    } finally {
      isFetchingSearchResults = false;
    }
  }


  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  function init() {
    console.log('[OkObserver] Initializing app, build:', APP_BUILD_LABEL);

    onRouteChange();

    document.addEventListener('okobs:route', (ev) => {
      const path =
        (ev && ev.detail && ev.detail.hash) || parseHashRoute();
      if (path !== '/' && !path.startsWith('/post/')) return;
      setTimeout(removeLazyloadEmbeds, 800);
    });
  }

  function removeLazyloadEmbeds() {
    const iframes = document.querySelectorAll('iframe[data-lazy-src]');
    iframes.forEach((iframe) => {
      const lazySrc = iframe.getAttribute('data-lazy-src');
      if (lazySrc) {
        iframe.removeAttribute('data-lazy-src');
        iframe.setAttribute('src', lazySrc);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
  });
})();

// 🔴 main.js — end of file (Splash & About stable; scroll debounce + grid rehydrate + Vimeo fix)
// 🔴 main.js

// Swipe between stories on a single post (like the website): swipe right = older, swipe left = newer.
(function setupPostSwipe() {
  let sx = 0, sy = 0, st = 0, ok = false;
  const blocked = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.matches && n.matches('input,textarea,select,iframe,video,audio,table,pre,.oo-listen-box,[data-oo="overlay"]')) return true;
      if (n.scrollWidth > n.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
    }
    return false;
  };
  window.addEventListener('touchstart', (e) => {
    ok = false;
    if (!/^#\/post\//.test(location.hash) || e.touches.length !== 1 || blocked(e.target)) return;
    const s = window.getSelection && window.getSelection();
    if (s && String(s).length) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); ok = true;
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (!ok) return;
    ok = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st > 700 || Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    const link = document.querySelector('.post-pn-link.' + (dx > 0 ? 'post-pn-prev' : 'post-pn-next'));
    if (link && link.getAttribute('href')) location.hash = link.getAttribute('href');
  }, { passive: true });
})();
