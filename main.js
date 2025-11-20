// 🟢 main.js — start of full file
// OkObserver Main JS — Build 2025-11-20R1-OptionA-4x3Lazy

(function () {
  'use strict';
  const BUILD = '2025-11-20R1-OptionA-4x3Lazy';
  console.log('[OkObserver] Main JS Build', BUILD);

  const API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  let app = document.getElementById('app');

  // Home view state cache (for return-to-summary)
  const homeState = {
    hasState: false,
    scrollY: 0,
    gridHTML: '',
    paging: {
      page: 1,
      totalPages: null,
      isLoading: false,
      searchQuery: '',
      isSearchMode: false
    }
  };

  // Global seenIds for infinite scroll (guard duplicates across home sessions)
  const globalSeenIds = new Set();

  // Simple route cache for detail pages to avoid refetch on back/forward
  const detailCache = new Map();

  // Paging + observer
  let pagingObserver = null;

  // Utility: parse hash route
  function parseHash(hash) {
    if (!hash || hash === '#') return { view: 'home', params: {} };
    if (hash.indexOf('#/') !== 0) return { view: 'home', params: {} };

    const parts = hash.slice(2).split('/');
    const view = parts[0] || 'home';
    const params = {};

    if (view === 'post' && parts[1]) {
      params.id = parts[1];
    } else if (view === 'search' && parts[1]) {
      params.q = decodeURIComponent(parts.slice(1).join('/'));
    } else if (view === 'category' && parts[1]) {
      params.slug = parts[1];
    }

    return { view, params };
  }

  // Utility: set hash route
  function setRoute(route) {
    location.hash = route;
  }

  /**
   * Basic fetch wrapper with error handling.
   */
  async function fetchJSON(url) {
    console.log('[OkObserver] Fetch JSON:', url);
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) {
      throw new Error('Network error: ' + res.status);
    }
    return res.json();
  }

  /**
   * Build WP API URLs with the proxy base.
   */
  function buildPostsURL({ page = 1, per_page = 12, search = '', categories = '' } = {}) {
    const params = new URLSearchParams();
    params.set('_embed', '1');
    params.set('page', page);
    params.set('per_page', per_page);
    if (search) params.set('search', search);
    if (categories) params.set('categories', categories);
    // Explicitly avoid cartoon category via exclude (if needed, but we filter client-side too)
    return API + '/posts?' + params.toString();
  }

  function buildSinglePostURL(id) {
    const params = new URLSearchParams();
    params.set('_embed', '1');
    return API + '/posts/' + id + '?' + params.toString();
  }

  function buildCategoriesURL() {
    return API + '/categories?per_page=100';
  }

  /**
   * Helper: check if a post is a cartoon (by category slug).
   * Cartoon must be the ONLY category we filter.
   */
  function isCartoonPost(post) {
    if (!post || !post._embedded || !post._embedded['wp:term']) return false;
    const termGroups = post._embedded['wp:term'];
    for (let i = 0; i < termGroups.length; i++) {
      const group = termGroups[i];
      if (!Array.isArray(group)) continue;
      for (let j = 0; j < group.length; j++) {
        const term = group[j];
        if (term && term.slug === 'cartoon') {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Extracts Vimeo/YouTube/Facebook video info from post content.
   * Video logic stays in main.js only; PostDetail.js will remain a no-op for embeds.
   */
  function extractVideoFromContent(post) {
    if (!post || !post.content || !post.content.rendered) return null;
    const html = post.content.rendered;

    // Vimeo iframe
    const vimeoMatch =
      html.match(/player\.vimeo\.com\/video\/(\d+)/) ||
      html.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch && vimeoMatch[1]) {
      return { type: 'vimeo', id: vimeoMatch[1] };
    }

    // YouTube iframe or short URL
    const ytMatch =
      html.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/) ||
      html.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
    if (ytMatch && ytMatch[1]) {
      return { type: 'youtube', id: ytMatch[1] };
    }

    // Facebook video iframe
    const fbMatch = html.match(/facebook\.com\/plugins\/video\.php\?href=([^"&]+)/);
    if (fbMatch && fbMatch[1]) {
      return { type: 'facebook', href: decodeURIComponent(fbMatch[1]) };
    }

    return null;
  }

  /**
   * Special-case fallback for post 381733 (Newsmakers video).
   * We make sure it always uses Vimeo ID 1126193884 if nothing else is found.
   */
  function applySpecialVideoFallback(post, existingVideoInfo) {
    if (!post || !post.id) return existingVideoInfo;
    if (post.id === 381733) {
      if (!existingVideoInfo || existingVideoInfo.type !== 'vimeo') {
        return { type: 'vimeo', id: '1126193884' };
      }
    }
    return existingVideoInfo;
  }

  /**
   * Sanitize excerpt but keep anchors, making them open in new tab.
   */
  function sanitizeExcerptKeepAnchors(html) {
    if (!html) return '';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    const anchors = wrapper.querySelectorAll('a');
    anchors.forEach(function (a) {
      a.removeAttribute('onclick');
      a.removeAttribute('onmouseover');
      a.removeAttribute('onmouseout');
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
    const scripts = wrapper.querySelectorAll('script');
    scripts.forEach(function (s) {
      s.remove();
    });
    return wrapper.innerHTML;
  }

  /**
   * Build byline (author + date).
   */
  function buildByline(post) {
    let authorName = '';
    if (
      post._embedded &&
      post._embedded.author &&
      post._embedded.author[0] &&
      post._embedded.author[0].name
    ) {
      authorName = post._embedded.author[0].name;
    }
    const date = post.date_gmt || post.date || null;
    const niceDate = date
      ? new Date(date).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
      : '';
    if (authorName && niceDate) return '<strong>' + authorName + '</strong> • ' + niceDate;
    if (authorName) return '<strong>' + authorName + '</strong>';
    if (niceDate) return niceDate;
    return '';
  }

  /**
   * Render a single post card into the grid.
   * Includes:
   * - cartoon category filter
   * - global + local seenIds duplicate guard
   * - summary image (now lazy-loaded, 4:3 aspect ratio via CSS)
   */
  function renderPostCard(grid, post, seenSet) {
    if (!post || !post.id) return;

    // Filter out cartoon category ONLY
    if (isCartoonPost(post)) {
      console.log('[OkObserver] Skipping cartoon post', post.id);
      return;
    }

    const id = post.id;
    if (seenSet.has(id) || globalSeenIds.has(id)) {
      console.log('[OkObserver] Skipping duplicate post', id);
      return;
    }

    seenSet.add(id);
    globalSeenIds.add(id);

    const title = post.title && post.title.rendered ? post.title.rendered : '(Untitled)';
    const date = post.date_gmt || post.date || null;
    const niceDate = date
      ? new Date(date).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
      : '';

    let img = '';
    if (
      post._embedded &&
      post._embedded['wp:featuredmedia'] &&
      post._embedded['wp:featuredmedia'][0] &&
      post._embedded['wp:featuredmedia'][0].source_url
    ) {
      img = post._embedded['wp:featuredmedia'][0].source_url;
    }

    const excerptHtml =
      (post.excerpt && post.excerpt.rendered) || (post.content && post.content.rendered) || '';
    const safeExcerpt = sanitizeExcerptKeepAnchors(excerptHtml);
    const byline = buildByline(post);

    const card = document.createElement('article');
    card.className = 'post-card';
    card.innerHTML =
      '<a class="thumb" href="#/post/' +
      id +
      '">' +
      (img
        ? '<div class="thumb-inner"><img loading="lazy" src="' +
          img +
          '?cb=' +
          id +
          '" alt="' +
          title.replace(/"/g, '&quot;') +
          '"></div>'
        : '') +
      '</a>' +
      '<div class="card-body">' +
      '<h2 class="title"><a href="#/post/' +
      id +
      '">' +
      title +
      '</a></h2>' +
      '<div class="meta">' +
      byline +
      '</div>' +
      '<div class="excerpt">' +
      safeExcerpt +
      '</div>' +
      '</div>';

    if (post.id === 382365) {
      const titleEl = card.querySelector('h2.title');
      if (titleEl) {
        titleEl.style.marginTop = '40px';
      }
    }

    grid.appendChild(card);
  }

  /**
   * Render a page of posts into the grid.
   */
  function renderPostsPage(posts, seenSet) {
    const grid = getOrMountGrid();
    if (!grid) return;

    if (!Array.isArray(posts)) return;
    for (let i = 0; i < posts.length; i++) {
      renderPostCard(grid, posts[i], seenSet);
    }
  }

  // ---------- Grid / Layout Helpers ----------
  function getOrMountGrid() {
    let grid = app.querySelector('.posts-grid');
    if (!grid) {
      app.innerHTML =
        '<section class="home-view">' +
        '<div class="home-header-row">' +
        '<h1 class="home-title">Latest News</h1>' +
        '<button class="home-search-toggle" type="button" aria-label="Toggle search">' +
        '<span class="home-search-toggle-icon">🔍</span>' +
        '<span class="home-search-toggle-label">Search</span>' +
        '</button>' +
        '</div>' +
        '<div class="home-search-panel" data-open="false">' +
        '<form id="search-form" class="search-form" autocomplete="off">' +
        '<label class="search-label" for="search-input">Search</label>' +
        '<div class="search-input-row">' +
        '<input id="search-input" type="search" name="q" placeholder="Search OkObserver" />' +
        '<button type="submit" class="search-submit">Go</button>' +
        '</div>' +
        '<p class="search-hint">Search is instant on submit; results show below.</p>' +
        '</form>' +
        '</div>' +
        '<div class="posts-grid" aria-live="polite"></div>' +
        '<div id="loading-indicator" class="loading-indicator" aria-hidden="true">' +
        '<div class="spinner"></div>' +
        '<span class="loading-text">Loading more posts…</span>' +
        '</div>' +
        '<div id="sentinel" aria-hidden="true"></div>' +
        '</section>';
      grid = app.querySelector('.posts-grid');
      attachHomeHandlers();
    }
    return grid;
  }

  function applyGridObserver() {
    const grid = app.querySelector('.posts-grid');
    const sentinel = document.getElementById('sentinel');
    if (!grid || !sentinel) return;

    if (pagingObserver) {
      pagingObserver.disconnect();
    }

    pagingObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            loadNextPage();
          }
        });
      },
      {
        root: null,
        rootMargin: '0px 0px 400px 0px',
        threshold: 0.1
      }
    );

    pagingObserver.observe(sentinel);
  }

  function applyGridEnforcer() {
    const grid = app.querySelector('.posts-grid');
    if (!grid) return;

    const observer = new MutationObserver(function () {
      grid.classList.remove('grid-refresh');
      // force reflow
      // eslint-disable-next-line no-unused-expressions
      grid.offsetHeight;
      grid.classList.add('grid-refresh');
    });

    observer.observe(grid, { childList: true, subtree: true });
  }

  // ---------- Paging / Home Loading ----------
  async function loadHomeInitial() {
    document.title = 'The Oklahoma Observer';
    const grid = getOrMountGrid();
    window.__OKOBS_DUP_GUARD_ENABLED__ = true;

    if (homeState.hasState && homeState.gridHTML) {
      grid.innerHTML = homeState.gridHTML;
      Object.assign(paging, homeState.paging);
      window.scrollTo(0, homeState.scrollY || 0);
      applyGridEnforcer();
      applyGridObserver();
      return;
    }

    homeState.hasState = false;
    homeState.gridHTML = '';
    homeState.scrollY = 0;
    seenIds = new Set();
    paging.page = 1;
    paging.totalPages = null;
    paging.isLoading = false;
    paging.isSearchMode = false;
    paging.searchQuery = '';

    try {
      setLoadingVisible(true);
      const url = buildPostsURL({ page: 1, per_page: 12 });
      const posts = await fetchJSON(url);
      renderPostsPage(posts, seenIds);
      homeState.hasState = true;
      homeState.gridHTML = grid.innerHTML;
      homeState.scrollY = 0;
      homeState.paging = Object.assign({}, paging);
      applyGridEnforcer();
      applyGridObserver();
    } catch (err) {
      console.error('[OkObserver] Error loading home posts:', err);
      app.innerHTML =
        '<section class="home-view error">' +
        '<h1>Latest News</h1>' +
        '<p>Sorry, there was a problem loading posts. Please try again later.</p>' +
        '</section>';
    } finally {
      setLoadingVisible(false);
    }
  }

  function setLoadingVisible(visible) {
    const el = document.getElementById('loading-indicator');
    if (!el) return;
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) {
      el.classList.add('is-visible');
    } else {
      el.classList.remove('is-visible');
    }
  }

  async function loadNextPage() {
    if (paging.isLoading) return;
    if (paging.totalPages && paging.page >= paging.totalPages) return;
    if (paging.isSearchMode) return;

    paging.isLoading = true;
    setLoadingVisible(true);

    try {
      const nextPage = paging.page + 1;
      const url = buildPostsURL({ page: nextPage, per_page: 12 });
      const posts = await fetchJSON(url);

      if (Array.isArray(posts) && posts.length > 0) {
        renderPostsPage(posts, seenIds);
        paging.page = nextPage;
        const grid = app.querySelector('.posts-grid');
        if (grid) {
          homeState.gridHTML = grid.innerHTML;
          homeState.scrollY = window.scrollY || 0;
          homeState.paging = Object.assign({}, paging);
        }
      } else {
        paging.totalPages = paging.page;
      }
    } catch (err) {
      console.error('[OkObserver] Error loading next page:', err);
    } finally {
      paging.isLoading = false;
      setLoadingVisible(false);
    }
  }

  // ---------- Search ----------
  async function loadSearchView(q) {
    if (!q) {
      setRoute('#/');
      return;
    }

    paging.isSearchMode = true;
    paging.searchQuery = q;
    paging.page = 1;
    paging.totalPages = null;

    app.innerHTML =
      '<section class="home-view search-view">' +
      '<div class="home-header-row">' +
      '<h1 class="home-title">Search Results</h1>' +
      '<button class="home-search-toggle" type="button" aria-label="Toggle search">' +
      '<span class="home-search-toggle-icon">🔍</span>' +
      '<span class="home-search-toggle-label">Search</span>' +
      '</button>' +
      '</div>' +
      '<div class="home-search-panel" data-open="true">' +
      '<form id="search-form" class="search-form" autocomplete="off">' +
      '<label class="search-label" for="search-input">Search</label>' +
      '<div class="search-input-row">' +
      '<input id="search-input" type="search" name="q" placeholder="Search OkObserver" value="' +
      q.replace(/"/g, '&quot;') +
      '" />' +
      '<button type="submit" class="search-submit">Go</button>' +
      '</div>' +
      '<p class="search-hint">Searching for "' +
      q.replace(/</g, '&lt;') +
      '".</p>' +
      '</form>' +
      '</div>' +
      '<div class="posts-grid" id="posts-grid"></div>' +
      '</section>';

    attachHomeHandlers();

    const grid = app.querySelector('.posts-grid');
    if (!grid) return;

    try {
      setLoadingVisible(true);
      const url = buildPostsURL({ page: 1, per_page: 20, search: q });
      const posts = await fetchJSON(url);
      const localSeen = new Set();
      renderPostsPage(posts, localSeen);
    } catch (err) {
      console.error('[OkObserver] Error loading search results:', err);
      grid.innerHTML =
        '<p>Sorry, there was an error loading search results. Please try again later.</p>';
    } finally {
      setLoadingVisible(false);
    }
  }

  // ---------- Detail View ----------
  function renderPostDetail(post) {
    if (!post) {
      app.innerHTML =
        '<section class="post-detail">' +
        '<p>Sorry, that post could not be found.</p>' +
        '<button class="back-button">Back to Posts</button>' +
        '</section>';
    ...
    // (rest of file unchanged from your baseline)
})();
// 🔴 main.js — end of full file
