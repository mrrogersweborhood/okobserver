// 🟢 main.js — start of full file
// OkObserver Main JS — Build 2025-11-19R8-mainVideo383136

(function () {
  'use strict';
  const BUILD = '2025-11-19R8-mainVideo383136';
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
  async function fetchJson(url) {
    console.log('[OkObserver] fetchJson:', url);
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
   * Decode HTML entities.
   */
  function decodeHtml(html) {
    if (!html) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    return textarea.value;
  }

  /**
   * Utility: sanitize excerpt but keep anchors, making them open in new tab.
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
      a.setAttribute('target', 'blank');
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
    if (authorName && niceDate) return authorName + ' — ' + niceDate;
    if (authorName) return authorName;
    if (niceDate) return niceDate;
    return '';
  }

  /**
   * Render a single post card into the grid.
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
        ? '<img src="' +
          img +
          '?cb=' +
          id +
          '" alt="' +
          title.replace(/"/g, '&quot;') +
          '">'
        : '') +
      '</a>' +
      '<div class="pad">' +
      '<h3><a href="#/post/' +
      id +
      '">' +
      title +
      '</a></h3>' +
      '<div class="byline">' +
      byline +
      '</div>' +
      '<div class="excerpt">' +
      safeExcerpt +
      '</div>' +
      '</div>';

    if (post.id === 382365) {
      const h = card.querySelector('h3');
      if (h) {
        h.style.marginTop = '40px';
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

    document.body.classList.add('home-has-grid');
  }

  // ---------- Grid / Layout Helpers ----------
  function getOrMountGrid() {
    let grid = app.querySelector('.posts-grid');
    if (!grid) {
      app.innerHTML =
        '<section class="home-view"><div class="posts-grid" aria-live="polite"></div><div id="loading-indicator" class="loading-indicator" aria-hidden="true"><div class="spinner"></div><span class="loading-text">Loading more posts…</span></div><div id="sentinel" aria-hidden="true"></div></section>';
      grid = app.querySelector('.posts-grid');
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
      // eslint-disable-next-line no-unused-expressions
      grid.offsetHeight;
      grid.classList.add('grid-refresh');
    });

    observer.observe(grid, { childList: true, subtree: true });
  }

  // ---------- Paging / Home Loading ----------
  const paging = homeState.paging;

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
    paging.page = 1;
    paging.totalPages = null;
    paging.isLoading = false;
    paging.isSearchMode = false;
    paging.searchQuery = '';

    try {
      setLoadingVisible(true);
      const url = buildPostsURL({ page: 1, per_page: 12 });
      const posts = await fetchJson(url);
      const seenSet = new Set();
      renderPostsPage(posts, seenSet);
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
      const posts = await fetchJson(url);

      if (Array.isArray(posts) && posts.length > 0) {
        const seenSet = new Set();
        renderPostsPage(posts, seenSet);
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
      '<button id="search-button" type="submit" class="search-submit">Go</button>' +
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
      const posts = await fetchJson(url);
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

  // ---------- Tidy helpers for post detail ----------

  function tidyArticleSpacing(bodyEl) {
    if (!bodyEl) return;
    const wrappers = bodyEl.querySelectorAll(
      '.wp-block-group, .wp-block-cover, .wp-block-spacer'
    );
    wrappers.forEach(function (w) {
      if (!w.textContent.trim() && !w.querySelector('iframe, video, img')) {
        w.remove();
      }
    });
  }

  function findVideoUrl(html) {
    if (!html) return null;

    // Vimeo
    let m =
      html.match(/https?:\/\/player\.vimeo\.com\/video\/(\d+)/i) ||
      html.match(/https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i);
    if (m && m[0]) return m[0];

    // YouTube
    m =
      html.match(/https?:\/\/www\.youtube\.com\/embed\/[a-zA-Z0-9_-]+/i) ||
      html.match(/https?:\/\/youtu\.be\/[a-zA-Z0-9_-]+/i);
    if (m && m[0]) return m[0];

    // Facebook
    m = html.match(/https?:\/\/www\.facebook\.com\/[^"'<>\s]+/i);
    if (m && m[0]) return m[0];

    return null;
  }

  function scrubLeadingEmbedPlaceholders(bodyEl, candidateUrl) {
    if (!bodyEl || !candidateUrl) return;
    const maybeEmbeds = bodyEl.querySelectorAll('figure, .wp-block-embed, .wp-block-video');

    for (let i = 0; i < maybeEmbeds.length; i++) {
      const node = maybeEmbeds[i];
      const html = node.innerHTML || '';
      if (html.indexOf(candidateUrl) !== -1) {
        const prev = node.previousElementSibling;
        if (prev && !prev.textContent.trim() && !prev.querySelector('img, iframe, video')) {
          prev.remove();
        }
        node.remove();
        break;
      }
    }
  }

  function buildTagsRow(post) {
    if (!post || !post._embedded || !post._embedded['wp:term']) return null;
    const termGroups = post._embedded['wp:term'];
    let tags = [];

    for (let i = 0; i < termGroups.length; i++) {
      const group = termGroups[i];
      if (!Array.isArray(group)) continue;
      group.forEach(function (term) {
        if (term && term.taxonomy === 'post_tag') {
          tags.push(term.name);
        }
      });
    }

    if (!tags.length) return null;

    const row = document.createElement('div');
    row.className = 'tags-row';
    row.innerHTML =
      '<h2 class="tags-title">Tags</h2>' +
      '<div class="tags-list">' +
      tags
        .map(function (t) {
          return '<span class="tag-pill">' + t + '</span>';
        })
        .join('') +
      '</div>';

    return row;
  }

  // ---------- Detail ----------
  function renderDetail(id) {
    window.onscroll = null;
    paging.done = true;
    paging.busy = false;

    // Hide until media/body ready to avoid a flash
    app.innerHTML = `
      <article class="post-detail" style="visibility:hidden; min-height:40vh">
        <div class="hero-wrap" style="position:relative;">
          <img class="hero" alt="" style="display:none" />
        </div>
        <div class="video-slot" style="display:none"></div>
        <h1 class="detail-title"></h1>
        <div class="detail-byline" style="font-weight:700;"></div>
        <div class="post-body"></div>
        <div class="back-row"><a class="back" href="#/">&larr; Back to Posts</a></div>
      </article>
    `;

    const detailEl = app.querySelector('.post-detail');
    const heroWrap = app.querySelector('.hero-wrap');
    const hero = app.querySelector('.hero');
    const titleEl = app.querySelector('.detail-title');
    const bylineEl = app.querySelector('.detail-byline');
    const bodyEl = app.querySelector('.post-body');

    if (!detailEl || !heroWrap || !hero || !titleEl || !bylineEl || !bodyEl)
      return;

    const postId = parseInt(id, 10);

    fetchJson(
      API +
        '/posts/' +
        postId +
        '?_embed=1'
    )
      .then(function (post) {
        if (!post || !post.id) throw new Error('Post not found');

        const title = decodeHtml((post.title && post.title.rendered) || '');
        titleEl.textContent = title;
        document.title = title + ' – The Oklahoma Observer';

        bylineEl.textContent = buildByline(post);

        let img =
          (post._embedded &&
            post._embedded['wp:featuredmedia'] &&
            post._embedded['wp:featuredmedia'][0] &&
            post._embedded['wp:featuredmedia'][0].source_url) ||
          '';
        if (img) {
          hero.src = img + '?cb=' + post.id;
          hero.style.display = 'block';
          hero.alt = title;
        }

        let bodyHTML = (post.content && post.content.rendered) || '';
        bodyHTML = decodeHtml(bodyHTML);
        bodyEl.innerHTML = bodyHTML;

        // scrub empty/ratio wrappers that create leading white gap
        tidyArticleSpacing(bodyEl);

        const videoSlot = app.querySelector('.video-slot');
        let candidate = findVideoUrl(bodyHTML);

        // Special case: post 383136 — ensure we use the correct Vimeo URL
        if (post.id === 383136) {
          var m383136 = bodyHTML.match(
            /https?:\/\/(?:www\.)?vimeo\.com\/1137090361\b/
          );
          if (m383136 && m383136[0]) {
            candidate = m383136[0];
          } else if (!candidate) {
            candidate = 'https://vimeo.com/1137090361';
          }
        }

        const isFB = candidate && /facebook\.com/i.test(candidate);

        if (isFB) {
          // Turn HERO into a “watch on Facebook” overlay (no separate video box)
          if (heroWrap && hero) {
            heroWrap.style.position = 'relative';
            heroWrap.style.cursor = 'pointer';

            const overlay = document.createElement('div');
            overlay.className = 'fb-watch-overlay';
            overlay.innerHTML = `
              <div class="fb-watch-gradient"></div>
              <button class="fb-watch-btn" type="button">
                <span class="icon">▶</span>
                <span class="label">Watch on Facebook</span>
              </button>
            `;
            heroWrap.appendChild(overlay);

            const openFB = function () {
              window.open(candidate, '_blank', 'noopener');
            };

            overlay.addEventListener('click', openFB);
            heroWrap.addEventListener('click', openFB);
          }
        } else if (candidate && videoSlot) {
          const isVimeo = /vimeo\.com/i.test(candidate);
          const isYT = /youtube\.com|youtu\.be/i.test(candidate);

          let iframeSrc = candidate;

          if (isVimeo) {
            const m = candidate.match(/vimeo\.com\/(\d+)/);
            const id = m && m[1] ? m[1] : '';
            iframeSrc = 'https://player.vimeo.com/video/' + id + '?title=0&byline=0&portrait=0';
          } else if (isYT) {
            const m =
              candidate.match(/embed\/([a-zA-Z0-9_-]+)/) ||
              candidate.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
            const id = m && m[1] ? m[1] : '';
            iframeSrc = 'https://www.youtube.com/embed/' + id + '?rel=0';
          }

          videoSlot.innerHTML = '';
          const iframe = document.createElement('iframe');
          iframe.src = iframeSrc;
          iframe.width = '640';
          iframe.height = '360';
          iframe.allow =
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
          iframe.allowFullscreen = true;
          iframe.setAttribute('frameborder', '0');
          iframe.style.display = 'block';
          iframe.style.margin = '0 auto';
          iframe.style.borderRadius = '14px';
          iframe.style.boxShadow = '0 8px 22px rgba(0,0,0,.15)';

          videoSlot.appendChild(iframe);

          // Reveal once iframe has loaded or after a short timeout
          videoSlot.style.display = 'block';

          // Scrub the original embed block so we don't get double players
          scrubLeadingEmbedPlaceholders(bodyEl, candidate);
        } else {
          // No custom embed built; leave WP’s own embed (player) in place.
        }

        // Insert tags row (pill chips) before the Back button, if tags exist
        const tagsRow = buildTagsRow(post);
        if (tagsRow) {
          const backRow = app.querySelector('.back-row');
          if (backRow && backRow.parentNode) {
            backRow.parentNode.insertBefore(tagsRow, backRow);
          }
        }

        detailEl.style.visibility = 'visible';
      })
      .catch(function (err) {
        console.error('[OkObserver] Error loading post detail:', err);
        app.innerHTML =
          '<section class="post-detail error"><p>Sorry, that post could not be found.</p><a class="back" href="#/">&larr; Back to Posts</a></section>';
      });
  }

  // ---------- Home Handlers ----------
  function attachHomeHandlers() {
    const searchToggle = app.querySelector('.home-search-toggle');
    const searchPanel = app.querySelector('.home-search-panel');
    const searchForm = app.querySelector('#search-form');
    const searchInput = app.querySelector('#search-input');
    const searchButton = app.querySelector('#search-button');

    if (searchToggle && searchPanel) {
      searchToggle.addEventListener('click', function () {
        const isOpen = searchPanel.getAttribute('data-open') === 'true';
        searchPanel.setAttribute('data-open', isOpen ? 'false' : 'true');
      });
    }

    if (searchForm && searchInput) {
      searchForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        const q = searchInput.value.trim();
        if (!q) return;
        setRoute('#/search/' + encodeURIComponent(q));
      });
    }

    if (searchButton && searchInput) {
      searchButton.addEventListener('click', function (ev) {
        ev.preventDefault();
        const q = searchInput.value.trim();
        if (!q) return;
        setRoute('#/search/' + encodeURIComponent(q));
      });
    }
  }

  // ---------- Router ----------
  function handleRouteChange() {
    const route = parseHash(location.hash || '#/');
    if (route.view === 'home') {
      loadHomeInitial();
    } else if (route.view === 'search') {
      loadSearchView(route.params.q || '');
    } else if (route.view === 'post') {
      renderDetail(route.params.id);
    } else {
      setRoute('#/');
    }
  }

  /**
   * Handle logo / nav clicks for SPA routing.
   * Motto must never be clickable or underlined.
   */
  function attachHeaderNavHandlers() {
    const logoLink = document.querySelector('.site-logo-link');
    if (logoLink) {
      logoLink.addEventListener('click', function (ev) {
        ev.preventDefault();
        setRoute('#/');
      });
    }

    const motto = document.querySelector('.site-motto');
    if (motto) {
      motto.style.pointerEvents = 'none';
    }

    const menuToggle = document.querySelector('.hamburger-button');
    const menuPanel = document.querySelector('.site-menu');
    const menuBackdrop = document.querySelector('.site-menu-backdrop');

    function closeMenu() {
      if (!menuPanel || !menuBackdrop || !menuToggle) return;
      menuPanel.setAttribute('data-open', 'false');
      menuBackdrop.setAttribute('data-open', 'false');
      menuToggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    }

    function openMenu() {
      if (!menuPanel || !menuBackdrop || !menuToggle) return;
      menuPanel.setAttribute('data-open', 'true');
      menuBackdrop.setAttribute('data-open', 'true');
      menuToggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-open');
    }

    if (menuToggle && menuPanel && menuBackdrop) {
      menuToggle.addEventListener('click', function () {
        const isOpen = menuPanel.getAttribute('data-open') === 'true';
        if (isOpen) {
          closeMenu();
        } else {
          openMenu();
        }
      });

      menuBackdrop.addEventListener('click', function () {
        closeMenu();
      });

      menuPanel.addEventListener('click', function (ev) {
        if (ev.target.matches('.site-menu a')) {
          closeMenu();
        }
      });
    }
  }

  // Optional helper: remove WP "lazyload" attributes from iframes/images
  // to avoid conflicts with our own lazy/JS logic (esp. for video embeds).
  function removeLazyloadEmbeds() {
    const lazyIframes = document.querySelectorAll('iframe[data-lazy-src]');
    lazyIframes.forEach(function (iframe) {
      if (iframe.dataset.lazySrc) {
        iframe.src = iframe.dataset.lazySrc;
        iframe.removeAttribute('data-lazy-src');
      }
    });

    const lazyImgs = document.querySelectorAll('img[data-lazy-src]');
    lazyImgs.forEach(function (img) {
      if (img.dataset.lazySrc) {
        img.src = img.dataset.lazySrc;
        img.removeAttribute('data-lazy-src');
      }
    });
  }

  window.addEventListener('hashchange', handleRouteChange);
  window.addEventListener('DOMContentLoaded', function () {
    attachHeaderNavHandlers();
    handleRouteChange();

    setTimeout(function () {
      const grid = app.querySelector('.posts-grid');
      if (grid) {
        grid.classList.remove('grid-refresh');
        // eslint-disable-next-line no-unused-expressions
        grid.offsetHeight;
        grid.classList.add('grid-refresh');
      }
      applyGridObserver();
    }, 0);
  });

  window.addEventListener('load', function () {
    setTimeout(removeLazyloadEmbeds, 800);
  });

  window.addEventListener('hashchange', function () {
    setTimeout(removeLazyloadEmbeds, 800);
  });

  document.addEventListener('okobs:detail-rendered', function (ev) {
    const hash =
      (ev && ev.detail && ev.detail.hash) || (location.hash || '#/');
    if (!hash.startsWith('#/post/')) return;
    setTimeout(removeLazyloadEmbeds, 800);
  });
})();
// 🔴 main.js — end of full file (includes remove WP lazyload iframes helper v2025-11-19R1)
