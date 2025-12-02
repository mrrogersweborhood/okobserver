🟢 main.js
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
//
// This is the baseline 2025-11-30R2 version WITHOUT the paging spinner changes.

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

  // Root app container
  const app = document.getElementById('app');

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

    // Remove leading '#'
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
      // Force a re-render if needed
      onRouteChange();
    } else {
      window.location.hash = hash;
    }
  }

  window.addEventListener('hashchange', () => {
    onRouteChange();
  });

  function onRouteChange(ev) {
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

  // ---------------------------------------------------------------------------
  // Content helpers
  // ---------------------------------------------------------------------------

  function extractCategories(post) {
    // When using _embed, categories may be in _embedded["wp:term"][0].
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

    const link = document.createElement('a');
    link.href = `#/post/${post.id}`;
    link.className = 'post-card-link';

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
      link.appendChild(imgWrapper);
    }

    const content = document.createElement('div');
    content.className = 'post-card-content';

    const titleEl = document.createElement('h2');
    titleEl.className = 'post-card-title';
    titleEl.innerHTML = post.title && post.title.rendered ? post.title.rendered : '(Untitled)';

    const meta = document.createElement('div');
    meta.className = 'post-card-meta';
    const dateStr = formatDate(post.date);
    meta.textContent = dateStr ? dateStr : '';

    const excerptEl = document.createElement('div');
    excerptEl.className = 'post-card-excerpt';
    excerptEl.innerHTML = post.excerpt && post.excerpt.rendered
      ? post.excerpt.rendered
      : '';

    content.appendChild(titleEl);
    content.appendChild(meta);
    content.appendChild(excerptEl);

    link.appendChild(content);
    card.appendChild(link);

    link.addEventListener('click', (evt) => {
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
          console.debug('[OkObserver] Skipping duplicate post ID:', post.id);
          continue;
        }
        seenPostIds.add(post.id);

        const card = createPostCard(post);
        frag.appendChild(card);
        appendedCount++;
      }

      if (appendedCount === 0) {
        console.debug('[OkObserver] No new posts appended for page', currentPage);
        currentPage++;
        hidePagingStatus();
        isFetchingPosts = false;
        return;
      }

      grid.appendChild(frag);

      if (posts.length < POSTS_PER_PAGE) {
        hasMorePages = false;
      } else {
        currentPage++;
      }

      if (isInitialHomeLoad) {
        isInitialHomeLoad = false;
        requestAnimationFrame(() => {
          window.scrollTo(0, 0);
        });
      }

    } catch (err) {
      console.error('[OkObserver] Error loading more posts:', err);
    } finally {
      isFetchingPosts = false;
      hidePagingStatus();
    }
  }

  // --- Paging status helper: blue "Loading more…" pill ---
  function showPagingStatus() {
    const grid = app.querySelector('.home-view .posts-grid');
    if (!grid) return;
    let status = document.getElementById('okobs-paging-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'okobs-paging-status';
      status.textContent = 'Loading more…';
      status.setAttribute('aria-live', 'polite');
      status.style.display = 'inline-block';
      status.style.margin = '16px auto 8px auto';
      status.style.padding = '8px 16px';
      status.style.borderRadius = '999px';
      status.style.background = '#1E90FF'; // OkObserver blue
      status.style.color = '#ffffff';
      status.style.fontWeight = '600';
      status.style.fontSize = '0.95rem';
      status.style.textAlign = 'center';
      status.style.boxShadow = '0 2px 8px rgba(0,0,0,.18)';
      status.style.userSelect = 'none';
    }
    status.hidden = false;
    if (!status.parentNode) {
      grid.insertAdjacentElement('afterend', status);
    }
  }

  function hidePagingStatus() {
    const status = document.getElementById('okobs-paging-status');
    if (status) status.hidden = true;
  }

  // ---------------------------------------------------------------------------
  // About view
  // ---------------------------------------------------------------------------

  function renderAbout() {
    stopTtsPlayback();

    saveHomeScroll();

    app.innerHTML = `
      <div class="about-view">
        <div class="about-inner">
          <h1>About The Oklahoma Observer</h1>
          <p>
            Founded in 1969, <strong>The Oklahoma Observer</strong> has chronicled state and national
            politics for more than half a century, with a mission:
          </p>
          <p class="about-motto">
            <em>To Comfort The Afflicted And Afflict The Comfortable</em>.
          </p>
          <p>
            The Observer’s fiercely independent journalism focuses on public policy, civil liberties,
            education, health care, and the countless ways government actions impact everyday Oklahomans.
          </p>
          <p>
            This reader-powered digital companion is designed to make it easier to browse recent coverage,
            read on any device, and discover stories you might have missed.
          </p>
          <p>
            For full archives, in-depth commentary, and subscription options, visit
            <a href="https://okobserver.org" target="_blank" rel="noopener noreferrer">okobserver.org</a>.
          </p>
        </div>
      </div>
    `;

    scrollToTop();
  }

  // ---------------------------------------------------------------------------
  // Search view
  // ---------------------------------------------------------------------------

  function renderSearch(params) {
    stopTtsPlayback();
    saveHomeScroll();

    const initialTerm = params && params.q ? params.q : '';

    app.innerHTML = `
      <div class="search-view">
        <div class="search-bar-row">
          <input
            type="search"
            class="search-input"
            placeholder="Search recent posts…"
            value="${escapeAttr(initialTerm)}"
            aria-label="Search posts"
          />
          <button class="search-button" type="button">Search</button>
        </div>
        <div class="search-results-grid"></div>
      </div>
    `;

    const input = app.querySelector('.search-input');
    const button = app.querySelector('.search-button');
    const grid = app.querySelector('.search-results-grid');
    if (!input || !button || !grid) return;

    button.addEventListener('click', () => {
      const term = input.value.trim();
      performSearch(term, grid);
    });

    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        const term = input.value.trim();
        performSearch(term, grid);
      }
    });

    if (initialTerm) {
      performSearch(initialTerm, grid);
    } else {
      scrollToTop();
    }
  }

  async function performSearch(term, grid) {
    if (!term) {
      grid.innerHTML = '<p class="search-empty">Enter a search term to begin.</p>';
      scrollToTop();
      return;
    }

    grid.innerHTML = '<p class="search-loading">Searching…</p>';
    scrollToTop();

    try {
      const results = await fetchSearchResults(term);
      if (!Array.isArray(results) || results.length === 0) {
        grid.innerHTML = '<p class="search-empty">No results found.</p>';
        return;
      }

      const frag = document.createDocumentFragment();
      let renderedCount = 0;

      for (const post of results) {
        if (hasExcludedCategory(post)) {
          continue;
        }
        const card = createPostCard(post);
        frag.appendChild(card);
        renderedCount++;
      }

      if (renderedCount === 0) {
        grid.innerHTML = '<p class="search-empty">No results found.</p>';
      } else {
        grid.innerHTML = '';
        grid.appendChild(frag);
      }

    } catch (err) {
      console.error('[OkObserver] Search error:', err);
      grid.innerHTML = '<p class="search-error">There was a problem searching. Please try again.</p>';
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

    saveHomeScroll();

    app.innerHTML = `
      <div class="post-detail-view">
        <div class="post-detail-inner post-detail-loading">
          <p>Loading…</p>
        </div>
      </div>
    `;

    scrollToTop();

    try {
      const post = await fetchPostById(id);
      renderPostDetailInner(post);
    } catch (err) {
      console.error('[OkObserver] Error loading post detail:', err);
      app.innerHTML = `
        <div class="post-detail-view">
          <div class="post-detail-inner">
            <p>There was a problem loading this article.</p>
            <button class="back-button" type="button">Back to posts</button>
          </div>
        </div>
      `;
      const back = app.querySelector('.back-button');
      if (back) {
        back.addEventListener('click', () => {
          navigateTo('#/');
        });
      }
    }
  }

  function renderPostDetailInner(post) {
    if (!post) {
      renderNotFound();
      return;
    }

    let heroHtml = '';
    const featuredImageUrl = getFeaturedImageUrl(post);
    if (featuredImageUrl) {
      heroHtml = `
        <div class="post-detail-hero-wrapper">
          <img
            class="post-detail-hero-image"
            src="${featuredImageUrl}?cb=${post.id}"
            alt="${escapeAttr(stripHtml(post.title && post.title.rendered)) || 'Post image'}"
          />
        </div>
      `;
    }

    const dateStr = formatDate(post.date);
    const titleHtml = post.title && post.title.rendered ? post.title.rendered : '(Untitled)';
    const contentHtml = post.content && post.content.rendered ? post.content.rendered : '';

    const bylineHtml = dateStr
      ? `<div class="post-detail-byline"><strong>${dateStr}</strong></div>`
      : '';

    const ttsButtonHtml = `
      <button class="tts-button" type="button" data-post-id="${post.id}">
        🔊 Listen to this article
      </button>
    `;

    app.innerHTML = `
      <div class="post-detail-view">
        <article class="post-detail-inner">
          ${heroHtml}
          <header class="post-detail-header">
            <h1 class="post-detail-title">${titleHtml}</h1>
            ${bylineHtml}
          </header>
          <div class="post-detail-tts-row">
            ${ttsButtonHtml}
          </div>
          <section class="post-detail-content">
            ${contentHtml}
          </section>
          <div class="post-detail-footer">
            <button class="back-button" type="button">Back to posts</button>
          </div>
        </article>
      </div>
    `;

    scrollToTop();

    const back = app.querySelector('.back-button');
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

    enhanceEmbedsInDetail(post);
  }

  function enhanceEmbedsInDetail(post) {
    if (!post || !post.content || !post.content.rendered) return;

    const detailContent = app.querySelector('.post-detail-content');
    if (!detailContent) return;

    const facebookVideos = detailContent.querySelectorAll('iframe[src*="facebook.com/plugins/video"]');
    facebookVideos.forEach((ifr) => {
      if (!ifr.hasAttribute('loading')) {
        ifr.setAttribute('loading', 'lazy');
      }
    });

    const hardcodedVimeoOverridePostId = 381733;
    if (post.id === hardcodedVimeoOverridePostId) {
      const vimeoId = '1126193884';
      const existingIframe = detailContent.querySelector('iframe[src*="vimeo.com"]');
      if (!existingIframe) {
        const figure = document.createElement('figure');
        figure.className = 'post-detail-video-figure';

        const iframe = document.createElement('iframe');
        iframe.src = `https://player.vimeo.com/video/${vimeoId}`;
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.setAttribute('loading', 'lazy');
        iframe.className = 'post-detail-video-iframe';

        figure.appendChild(iframe);
        detailContent.insertBefore(figure, detailContent.firstChild);
      }
    }
  }

  function renderNotFound() {
    stopTtsPlayback();

    app.innerHTML = `
      <div class="not-found-view">
        <h1>Not Found</h1>
        <p>The page you requested could not be found.</p>
        <button class="back-button" type="button">Back to posts</button>
      </div>
    `;

    scrollToTop();

    const back = app.querySelector('.back-button');
    if (back) {
      back.addEventListener('click', () => {
        navigateTo('#/');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // MutationObserver for grid sanity
  // ---------------------------------------------------------------------------

  function setupGridMutationObserver() {
    const gridSelector = '.home-view .posts-grid';

    const observer = new MutationObserver((mutations) => {
      let touched = false;
      for (const m of mutations) {
        if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
          touched = true;
          break;
        }
      }
      if (!touched) return;

      const grid = document.querySelector(gridSelector);
      if (!grid) return;

      grid.classList.add('grid-hydrated');
    });

    const root = document.body;
    if (!root) return;

    observer.observe(root, {
      childList: true,
      subtree: true
    });

    console.debug('[OkObserver] Grid MutationObserver set up.');
  }

  // ---------------------------------------------------------------------------
  // SW registration helper (kept minimal)
  // ---------------------------------------------------------------------------

  function registerServiceWorkerIfSupported() {
    if (!('serviceWorker' in navigator)) {
      console.debug('[OkObserver] Service workers not supported in this browser.');
      return;
    }

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/okobserver/sw.js', {
        scope: '/okobserver/',
        updateViaCache: 'none'
      }).then((reg) => {
        console.info('[OkObserver] Service worker registered:', reg.scope);
      }).catch((err) => {
        console.error('[OkObserver] Service worker registration failed:', err);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Lazy removal of embeds when leaving post detail
  // ---------------------------------------------------------------------------

  function removeLazyloadEmbeds() {
    try {
      const detail = document.querySelector('.post-detail-view');
      if (!detail) return;

      const iframes = detail.querySelectorAll('iframe');
      iframes.forEach((ifr) => {
        const src = ifr.getAttribute('src');
        if (!src) return;
        if (src.includes('youtube.com') || src.includes('vimeo.com') || src.includes('facebook.com')) {
          const ds = ifr.getAttribute('data-src') || src;
          ifr.setAttribute('src', ds);
          ifr.removeAttribute('data-src');
        }
      });
    } catch (err) {
      console.error('[OkObserver] Error in removeLazyloadEmbeds:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  function init() {
    setupGridMutationObserver();
    registerServiceWorkerIfSupported();
    onRouteChange();

    document.addEventListener('hashchange', () => {
      const { path } =
      (ev && ev.detail && ev.detail.hash) || parseHashRoute();
      if (path !== '/' && !path.startsWith('/post/')) return;
      setTimeout(removeLazyloadEmbeds, 800);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
  });
})();

// 🔴 main.js — end of file (loaderSafe2 + scrollRestoreFix1 + TTS chunked + pagingUX1 + perf2-ttsChunks-hotfix1)
🔴 main.js
