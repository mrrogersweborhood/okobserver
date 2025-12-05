// 🟢 main.js
// 🟢 main.js — start of file
// OkObserver Main JS
// Build 2025-11-30R2 (loaderSafe2 + scrollRestoreFix1 + TTS chunked + pagingUX1 + perf2-ttsChunks-hotfix1)
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

  const APP_BUILD_TAG = '2025-11-30R2';
  const APP_BUILD_LABEL = 'OkObserver Build 2025-11-30R2 — Header stable, mobile logo corrected, search grid cleanup, no regressions';

  // Proxy base (must always be used instead of direct WP origin)
  const WP_API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';

  // Category name(s) that should be filtered out (e.g., cartoons)
  const EXCLUDED_CATEGORY_SLUGS = ['cartoon'];

  // Infinite scroll / paging settings
  const POSTS_PER_PAGE = 12;
  const SCROLL_SENTRY_OFFSET = 0.9; // intersection ratio for near-bottom detection

  // Scroll restoration and routing
  const homeState = {
    scrollY: 0,
    initialized: false
  };

  // Simple in-memory cache for posts (by ID) to avoid refetching
  const postCache = new Map();

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

  window.addEventListener('hashchange', () => {
    onRouteChange();
  });

  function onRouteChange() {
    const { path, params } = parseHashRoute();
    console.info('[OkObserver] Route change:', path, params);

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
    } else if (path === '/about') {
      renderAbout();
    } else if (path === '/search') {
      renderSearch(params);
    } else {
      renderNotFound();
    }
  }

  // Scroll helpers
  function saveHomeScroll() {
    homeState.scrollY = window.scrollY || window.pageYOffset || 0;
    homeState.initialized = true;
    console.debug('[OkObserver] Saved home scrollY:', homeState.scrollY);
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

  async function fetchJson(url, options) {
    console.debug('[OkObserver] fetchJson:', url);
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
  }

  async function fetchPostsPage(page) {
    const url = `${WP_API_BASE}/posts?per_page=${POSTS_PER_PAGE}&page=${page}&_embed`;
    return fetchJson(url);
  }

  async function fetchPostById(id) {
    if (postCache.has(id)) {
      return postCache.get(id);
    }

    const url = `${WP_API_BASE}/posts/${id}?_embed`;
    const data = await fetchJson(url);
    postCache.set(id, data);
    return data;
  }

  async function fetchSearchResults(term) {
    const enc = encodeURIComponent(term || '');
    const url = `${WP_API_BASE}/posts?search=${enc}&per_page=${POSTS_PER_PAGE}&page=1&_embed`;
    return fetchJson(url);
  }
  // Cached About page (contact-about-donate) so we only fetch once
  let aboutPageCache = null;

  async function fetchAboutPage() {
    if (aboutPageCache) return aboutPageCache;

    const url = `${WP_API_BASE}/pages?slug=contact-about-donate&_embed`;
    const pages = await fetchJson(url);
    const page = Array.isArray(pages) && pages.length ? pages[0] : null;

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
            if (term.taxonomy === 'category') {
              return termGroup;
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

  function stopTtsPlayback() {
    if (ttsAbortController) {
      ttsAbortController.abort();
      ttsAbortController = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    currentTtsPostId = null;
  }

  async function speakChunksSequentially(text, postId) {
    if (!window.speechSynthesis) {
      alert('Text-to-speech is not supported in this browser.');
      return;
    }

    stopTtsPlayback();

    const chunks = splitTextIntoChunks(text, TTS_CHUNK_SIZE);
    if (!chunks.length) return;

    const localAbort = new AbortController();
    ttsAbortController = localAbort;
    currentTtsPostId = postId || null;

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
      }
    }
  }

  function buildTtsTextFromHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const text = tmp.textContent || tmp.innerText || '';
    return text.replace(/\s+/g, ' ').trim();
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

      imgWrapper.appendChild(img);
      card.appendChild(imgWrapper);
    }

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
    let metaText = '';
    if (authorName) metaText += authorName;
    if (dateStr) {
      metaText += (metaText ? ' • ' : '') + dateStr;
    }
    meta.textContent = metaText;

    const excerptEl = document.createElement('div');
    excerptEl.className = 'post-card-excerpt';
    excerptEl.innerHTML = post.excerpt && post.excerpt.rendered
      ? post.excerpt.rendered
      : '';

    content.appendChild(titleEl);
    content.appendChild(meta);
    content.appendChild(excerptEl);

    card.appendChild(content);

    card.addEventListener('click', (evt) => {
      const clickedLink = evt.target.closest('a');
      if (clickedLink && !clickedLink.classList.contains('post-card-title-link')) {
        // Let links inside the excerpt behave like normal links.
        return;
      }
      evt.preventDefault();
      saveHomeScroll();
      navigateTo(`#/post/${post.id}`);
    });

    return card;
  }

  function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  // ---------------------------------------------------------------------------
  // Home view
  // ---------------------------------------------------------------------------

  function renderHome() {
    stopTtsPlayback();

    app.innerHTML = `
      <div class="home-view">
        <div class="posts-grid"></div>
      </div>
    `;

    const grid = app.querySelector('.posts-grid');
    if (!grid) return;

    if (!homeState.initialized) {
      isInitialHomeLoad = true;
      currentPage = 1;
      hasMorePages = true;
      seenPostIds.clear();
      window.__OKOBS_DUP_GUARD_ENABLED__ = true;

      setupInfiniteScroll(grid);
      loadMorePosts();
    } else {
      setupInfiniteScroll(grid);
      hydrateExistingHomeGrid(grid);
      restoreHomeScroll();
    }
  }

  function hydrateExistingHomeGrid(grid) {
    const hash = window.location.hash || '#/';
    if (!hash || hash === '#/' || hash === '#') {
      const existingCards = document.querySelectorAll('.home-view .posts-grid .post-card');
      if (existingCards.length > 0) {
        console.debug('[OkObserver] Hydrating home grid with', existingCards.length, 'existing cards');
      }
      return;
    }

    grid.innerHTML = '';
    currentPage = 1;
    hasMorePages = true;
    seenPostIds.clear();
    window.__OKOBS_DUP_GUARD_ENABLED__ = true;

    loadMorePosts();
  }

  function setupInfiniteScroll(grid) {
    if (infiniteObserver) {
      infiniteObserver.disconnect();
      infiniteObserver = null;
    }

    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    grid.insertAdjacentElement('afterend', sentinel);

    infiniteObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= SCROLL_SENTRY_OFFSET) {
          if (!isFetchingPosts && hasMorePages) {
            loadMorePosts();
          }
        }
      }
    }, {
      root: null,
      threshold: [SCROLL_SENTRY_OFFSET]
    });

    infiniteObserver.observe(sentinel);
  }

  async function loadMorePosts() {
    if (isFetchingPosts || !hasMorePages) return;

    isFetchingPosts = true;
    showPagingStatus();

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
        hidePagingStatus();
        return;
      }

      let appendedCount = 0;
      const frag = document.createDocumentFragment();

      for (const post of posts) {
        if (hasExcludedCategory(post)) {
          continue;
        }

        if (seenPostIds.has(post.id)) {
          continue;
        }

        seenPostIds.add(post.id);
        const card = createPostCard(post);
        frag.appendChild(card);
        appendedCount++;
      }

      if (appendedCount > 0) {
        grid.appendChild(frag);
      }

      currentPage += 1;
      hidePagingStatus();

      if (isInitialHomeLoad) {
        isInitialHomeLoad = false;
        hideInitialLoader();
      }
    } catch (err) {
      console.error('[OkObserver] Error loading more posts:', err);
      hidePagingStatus();
    } finally {
      isFetchingPosts = false;
    }
  }

  function showPagingStatus() {
    let status = document.querySelector('.paging-status');
    if (!status) {
      status = document.createElement('div');
      status.className = 'paging-status';
      status.textContent = 'Loading more…';
      app.appendChild(status);
    }
    status.style.display = 'block';
  }

  function hidePagingStatus() {
    const status = document.querySelector('.paging-status');
    if (status) {
      status.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
}
// ---------------------------------------------------------------------------
// About view
// ---------------------------------------------------------------------------

async function renderAbout() {
  stopTtsPlayback();
  scrollToTop();

  app.innerHTML = `
    <article class="about-view">
      <h1 class="about-title">About The Oklahoma Observer</h1>
      <div class="about-content">
        <p>Loading about information…</p>
      </div>
    </article>
  `;

  const contentEl = app.querySelector('.about-content');
  if (!contentEl) return;

  try {
    const page = await fetchAboutPage();
    if (!page || !page.content || !page.content.rendered) {
      contentEl.innerHTML = '<p>Unable to load About page right now.</p>';
      return;
    }

    // Drop the raw WP HTML into a wrapper
    contentEl.innerHTML = `
      <div class="about-html">
        ${page.content.rendered}
      </div>
    `;

    const root = contentEl.querySelector('.about-html');
    if (!root) return;

    // Optionally trim off sections like "Subscriptions" / "Merch" at the bottom
    const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4'));
    let cutFrom = null;
    headings.forEach((h) => {
      const text = (h.textContent || '').trim();
      if (/^subscriptions$/i.test(text) || /^merch/i.test(text)) {
        cutFrom = h;
      }
    });
    if (cutFrom && cutFrom.parentElement) {
      let node = cutFrom;
      while (node) {
        const next = node.nextSibling;
        node.parentNode.removeChild(node);
        node = next;
      }
    }

    // Fix lazy-loaded images so they actually show
    root.querySelectorAll('img').forEach((img) => {
      const dataSrc = img.getAttribute('data-src');
      const dataSrcset = img.getAttribute('data-srcset');

      if (dataSrc) {
        img.src = dataSrc;
      }
      if (dataSrcset) {
        img.srcset = dataSrcset;
      }

      img.removeAttribute('data-src');
      img.removeAttribute('data-srcset');
      img.classList.add('about-image');
      img.removeAttribute('width');
      img.removeAttribute('height');
    });
  } catch (err) {
    console.error('[OkObserver] Error loading About page:', err);
    contentEl.innerHTML = '<p>Unable to load About page right now.</p>';
  }
}

  // ---------------------------------------------------------------------------
  // Search view
  // ---------------------------------------------------------------------------

  function renderSearch(params) {
    stopTtsPlayback();
    scrollToTop();

    const initialQuery = (params && params.q) || '';

    app.innerHTML = `
      <div class="search-view">
        <h1 class="search-title">Search Posts</h1>
        <form class="search-form" novalidate>
          <label class="search-label">
            <span class="search-label-text">Search term</span>
            <input
              class="search-input"
              type="search"
              name="q"
              placeholder="Type keywords&hellip;"
              value="${escapeAttr(initialQuery)}"
            />
          </label>
          <button class="search-submit" type="submit">Search</button>
        </form>
        <div class="search-status" aria-live="polite"></div>
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

    if (initialQuery) {
      performSearch(initialQuery, statusEl, grid);
    }

    form.addEventListener('submit', (evt) => {
      evt.preventDefault();
      const value = input.value.trim();
      if (!value) {
        statusEl.textContent = 'Please enter a search term.';
        grid.innerHTML = '';
        navigateTo('#/search');
        return;
      }
      statusEl.textContent = 'Searching…';
      grid.innerHTML = '';
      performSearch(value, statusEl, grid);
      const enc = encodeURIComponent(value);
      navigateTo(`#/search?q=${enc}`);
    });
  }

  async function performSearch(term, statusEl, grid) {
    try {
      const results = await fetchSearchResults(term);
      if (!Array.isArray(results) || results.length === 0) {
        statusEl.textContent = 'No results found.';
        grid.innerHTML = '';
        return;
      }

      const frag = document.createDocumentFragment();
      let rendered = 0;

      results.forEach(post => {
        if (hasExcludedCategory(post)) {
          return;
        }
        const card = createPostCard(post);
        frag.appendChild(card);
        rendered++;
      });

      if (rendered > 0) {
        grid.innerHTML = '';
        grid.appendChild(frag);
        statusEl.textContent = `${rendered} result${rendered === 1 ? '' : 's'} found.`;
      } else {
        statusEl.textContent = 'No visible results (some posts may be filtered).';
        grid.innerHTML = '';
      }
    } catch (err) {
      console.error('[OkObserver] Search error:', err);
      statusEl.textContent = 'An error occurred while searching.';
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

  // ---------------------------------------------------------------------------
  // Post detail view
  // ---------------------------------------------------------------------------

  async function renderPostDetail(id) {
    stopTtsPlayback();
    scrollToTop();

    app.innerHTML = `
      <div class="post-detail-loading">
        <p>Loading article…</p>
      </div>
    `;

    try {
      const post = await fetchPostById(id);
      renderPostDetailInner(post);
    } catch (err) {
      console.error('[OkObserver] Error loading post detail:', err);
      renderNotFound();
    }
  }

  function renderPostDetailInner(post) {
    if (!post) {
      renderNotFound();
      return;
    }

    const rawTitle = post.title && post.title.rendered ? post.title.rendered : '(Untitled)';
    const titleHtml = rawTitle;
    const contentHtml = post.content && post.content.rendered ? post.content.rendered : '';

    const dateStr = formatDate(post.date);
    const authorName = getAuthorName(post);
    const metaParts = [];
    if (authorName) metaParts.push(authorName);
    if (dateStr) metaParts.push(dateStr);
    const metaHtml = metaParts.length
      ? `<div class="post-meta">${metaParts.join(' • ')}</div>`
      : '';

    let heroHtml = '';
    const featuredImageUrl = getFeaturedImageUrl(post);
    if (featuredImageUrl) {
      heroHtml = `
        <div class="post-hero">
          <img
            class="oo-media"
            src="${featuredImageUrl}?cb=${post.id}"
            alt="${escapeAttr(stripHtml(rawTitle)) || 'Post image'}"
          />
        </div>
      `;
    }

    const ttsButtonHtml = `
  <button class="tts-button" type="button" data-post-id="${post.id}">🔊</button>
`;

    app.innerHTML = `
      <div class="post-detail">
        ${heroHtml}
        <h1 class="post-title">${titleHtml}</h1>
        ${metaHtml}
        <div class="post-detail-tts-row">
          ${ttsButtonHtml}
        </div>
        <div class="post-content post-detail-content entry-content">
          ${contentHtml}
        </div>
        <button class="back-btn" type="button">Back to posts</button>
      </div>
    `;

    scrollToTop();

    const back = app.querySelector('.back-btn');
    if (back) {
      back.addEventListener('click', () => {
        navigateTo('#/');
      });
    }

        const ttsButton = app.querySelector('.tts-button');
    if (ttsButton) {
      ttsButton.addEventListener('click', () => {
        const current = currentTtsPostId;
        const thisId = post.id;
        if (current && current === thisId) {
          stopTtsPlayback();
        } else {
          const text = buildTtsTextFromHtml(contentHtml);
          speakChunksSequentially(text, thisId);
        }
      });
    }

    // Insert top-of-article embeds (YouTube/Vimeo/Facebook, overrides, etc.)
    enhanceEmbedsInDetail(post);

    // NEW: fix any lazy-loaded iframes (data-lazy-src → src) so the players actually render
    removeLazyloadEmbeds();
  }


function enhanceEmbedsInDetail(post) {
  const container = app.querySelector('.post-detail-content');
  if (!container || !post) return;

  const html = post.content && post.content.rendered ? post.content.rendered : '';
  if (!html) return;

  // Hard overrides for posts whose embeds are too weird to parse reliably
const videoOverrides = {
  // November ’25 Newsmaker
  '383136': 'https://player.vimeo.com/video/1137090361',

  // Oct ’25 Newsmakers
  '381733': 'https://player.vimeo.com/video/1126193804',

  // Jul ’25 Newsmakers — POST 374604 (THIS FIXES THE MISSING VIDEO + WHITESPACE)
  '374604': 'https://player.vimeo.com/video/1126193804'
};

  const overrideSrc = videoOverrides[post.id];
  if (overrideSrc) {
    const existingIframe = container.querySelector(`iframe[src*="${overrideSrc}"]`);
    if (!existingIframe) {
      const iframe = document.createElement('iframe');
      iframe.src = overrideSrc;
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('frameborder', '0');
      iframe.className = 'video-embed video-embed-vimeo';
      container.insertBefore(iframe, container.firstChild);
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

        if (/youtube\.com\/watch\?v=/.test(href) || /youtu\.be\//.test(href)) {
          videoEmbedHtml = buildYouTubeEmbedFromUrl(href);
          break;
        }
        if (/vimeo\.com\/\d+/.test(href)) {
          videoEmbedHtml = buildVimeoEmbedFromUrl(href);
          break;
        }
        if (/facebook\.com\/.*\/videos\//.test(href)) {
          // For Facebook: show a "Watch on Facebook" overlay and REMOVE the dead iframe.
          addFacebookWatchOverlay(href);
          // Do NOT set videoEmbedHtml – we don't want an embedded Facebook player.
          break;
        }
      }

      // 4) Plain-text URLs inside the HTML (like 381733, 377530, etc.)
      if (!videoEmbedHtml) {
        const htmlText = html;

        const vimeoMatch = htmlText.match(/https?:\/\/(?:www\.)?vimeo\.com\/\d+/);
        const ytMatch = htmlText.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[^"'<\s]+|youtu\.be\/[A-Za-z0-9_-]+)/);
        const fbMatch = htmlText.match(/https?:\/\/(?:www\.)?facebook\.com\/[^"'<\s]+\/videos\/\d+/);

        const urlMatch = vimeoMatch || ytMatch || fbMatch;
        if (urlMatch) {
          const url = urlMatch[0];

          if (vimeoMatch) {
            videoEmbedHtml = buildVimeoEmbedFromUrl(url);
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

   if (videoEmbedHtml) {
    const wrapper = document.createElement('div');
    wrapper.className = 'video-embed-wrapper';
    wrapper.innerHTML = videoEmbedHtml;
    container.insertBefore(wrapper, container.firstChild);
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
  // Not found view
  // ---------------------------------------------------------------------------

  function renderNotFound() {
    stopTtsPlayback();
    scrollToTop();

    app.innerHTML = `
      <div class="not-found">
        <h1>Not Found</h1>
        <p>The page you&apos;re looking for could not be found.</p>
        <button class="back-btn" type="button">Back to posts</button>
      </div>
    `;

    const back = app.querySelector('.back-btn');
    if (back) {
      back.addEventListener('click', () => {
        navigateTo('#/');
      });
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

// 🔴 main.js — end of file (loaderSafe2 + scrollRestoreFix1 + TTS chunked + pagingUX1 + perf2-ttsChunks-hotfix1)
// 🔴 main.js
