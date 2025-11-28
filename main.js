// 🟢 main.js — start of file
// OkObserver Main JS
// Build 2025-11-19R8-mainVideo383136-perf2-ttsChunks
// + loaderSafe2
// + scrollRestoreFix1
// + TTS mobile (ttsIconFix2 + ttsMobileLongPostFix1)
// + TTS chunked playback (ttsChunks1)
// + pagingUX1 (blue "Loading more…" pill)
// + perf1 (detail view postCache)
// NOTE: 🟢/🔴 markers are comments only per project rules.

(function () {
  'use strict';
  const BUILD = '2025-11-19R8-mainVideo383136-perf2-ttsChunks';
  console.log('[OkObserver] Main JS Build', BUILD);

  const API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  let app = document.getElementById('app');
  let headerNavInitialized = false;

  // Home view state cache (for return-to-summary)
  const homeState = {
    hasState: false,
    scrollY: 0,
    gridHTML: '',
    paging: null,
  };

  const paging = {
    page: 1,
    busy: false,
    done: false,
  };

  let seenIds = new Set();
  window.__OKOBS_DUP_GUARD_ENABLED__ = false;

  let lastHash = window.location.hash || '#/';

  // In-memory cache of posts for faster detail view re-entry (perf1)
  const postCache = new Map();

  // --- Text-to-Speech (TTS) state ---
  let ttsCurrentUtterance = null;
  let ttsIsPaused = false;
  // TTS multi-segment state (ttsChunks1)
  let ttsSegments = null;
  let ttsSegmentIndex = 0;

  function stopTTS() {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        // ignore
      }
    }
    ttsCurrentUtterance = null;
    ttsIsPaused = false;
    ttsSegments = null;
    ttsSegmentIndex = 0;
  }

  // --------- Utilities ---------

  function hideLoadingOverlay() {
    const overlay = document.getElementById('okobs-loading-overlay');
    if (overlay) overlay.classList.add('okobs-hidden');
  }

  function decodeHtml(html) {
    if (!html) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  }

  function fetchJson(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('Network response was not ok');
      return r.json();
    });
  }

  function createEl(tag, className, html) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html != null) el.innerHTML = html;
    return el;
  }

  // ---------- Grid / Layout Helpers ----------
  function getOrMountGrid() {
    let grid = app.querySelector('.posts-grid');
    if (!grid) {
      app.innerHTML =
        '<section class="home-view"><div class="posts-grid" aria-live="polite"></div><div id="sentinel" aria-hidden="true"></div></section>';
      grid = app.querySelector('.posts-grid');
    }
    return grid;
  }

  let pagingObserver = null;

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
            loadMorePosts();
          }
        });
      },
      {
        root: null,
        // Earlier trigger so mobile has time to fetch before you hit bottom
        rootMargin: '0px 0px 900px 0px',
        threshold: 0.1,
      }
    );
    pagingObserver.observe(sentinel);
  }

  function enforceGridLayout() {
    const grid = app.querySelector('.posts-grid');
    if (!grid) return;

    const applyLayout = function () {
      grid.style.columnCount = '';
      const width = window.innerWidth;
      if (width >= 1200) {
        grid.style.columnCount = '4';
      } else if (width >= 768) {
        grid.style.columnCount = '3';
      } else {
        grid.style.columnCount = '1';
      }
    };

    applyLayout();
    window.addEventListener('resize', applyLayout);

    const mo = new MutationObserver(function () {
      applyLayout();
    });
    mo.observe(grid, { childList: true, subtree: true });
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

  // ---------- Make Card ----------
  function sanitizeExcerptKeepAnchors(html) {
    if (html === void 0) html = '';
    const root = document.createElement('div');
    root.innerHTML = html;
    root.querySelectorAll('script,style,noscript').forEach(function (n) {
      n.remove();
    });
    const out = [];
    (function collect(node) {
      node.childNodes.forEach(function (n) {
        if (n.nodeType === 3) out.push(n.textContent);
        else if (n.nodeType === 1) {
          if (n.tagName === 'A') {
            const a = n.cloneNode(true);
            a.removeAttribute('onclick');
            a.removeAttribute('onmouseover');
            a.removeAttribute('onmouseout');
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener');
            out.push(a.outerHTML);
          } else {
            collect(n);
          }
        }
      });
    })(root);
    return out.join('');
  }

  function isCartoon(post) {
    if (!post || !post._embedded || !post._embedded['wp:term']) return false;
    const termsArr = post._embedded['wp:term'];
    for (let i = 0; i < termsArr.length; i++) {
      const group = termsArr[i];
      if (!group) continue;
      for (let j = 0; j < group.length; j++) {
        const term = group[j];
        if (term && term.slug === 'cartoon') return true;
      }
    }
    return false;
  }

  function buildByline(post) {
    const by =
      (post._embedded &&
        post._embedded.author &&
        post._embedded.author[0] &&
        post._embedded.author[0].name) ||
      'Oklahoma Observer';
    const dateStr = formatDate(post.date);
    if (by && dateStr) return by + ' — ' + dateStr;
    if (by) return by;
    if (dateStr) return dateStr;
    return '';
  }

  function makeCard(post) {
    const id = post.id;
    if (seenIds.has(id)) return null;
    if (isCartoon(post)) return null;

    seenIds.add(id);

    const title = decodeHtml((post.title && post.title.rendered) || '');
    const excerptHtml =
      (post.excerpt && post.excerpt.rendered) || post.content.rendered || '';
    const safeExcerpt = sanitizeExcerptKeepAnchors(excerptHtml);
    const byline = buildByline(post);

    let img = '';
    if (
      post._embedded &&
      post._embedded['wp:featuredmedia'] &&
      post._embedded['wp:featuredmedia'][0] &&
      post._embedded['wp:featuredmedia'][0].source_url
    ) {
      img = post._embedded['wp:featuredmedia'][0].source_url;
    }

    const card = document.createElement('article');
    card.className = 'post-card';
    card.innerHTML =
      '<a class="thumb" href="#/post/' +
      id +
      '">' +
      (img
        ? '<div class="thumb-inner"><img src="' +
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

    return card;
  }

  // ------------ Home Renderer ------------
  function renderHome() {
    document.title = 'The Oklahoma Observer';
    const grid = getOrMountGrid();
    window.__OKOBS_DUP_GUARD_ENABLED__ = true;

    // Restore from cached home state (grid + paging + scroll)
    if (homeState.hasState && homeState.gridHTML) {
      grid.innerHTML = homeState.gridHTML;
      Object.assign(paging, homeState.paging || {});
      applyGridObserver();
      enforceGridLayout();
      requestAnimationFrame(function () {
        window.scrollTo(0, homeState.scrollY || 0);
      });
      hideLoadingOverlay();
      hidePagingStatus();
      return;
    }

    // Fresh load path
    grid.innerHTML = '';
    paging.page = 1;
    paging.busy = false;
    paging.done = false;
    seenIds = new Set();
    hidePagingStatus();

    // Failsafe: if something goes wrong with the first load,
    // make sure the overlay doesn’t stay stuck forever.
    setTimeout(function () {
      hideLoadingOverlay();
    }, 12000);

    loadMorePosts(true);
  }

  function loadMorePosts(isFirst) {
    if (paging.busy || paging.done) return;
    paging.busy = true;
    showPagingStatus();

    const url =
      API +
      '/posts?per_page=12&page=' +
      paging.page +
      '&_embed=1&orderby=date&order=desc';

    fetchJson(url)
      .then(function (posts) {
        if (!Array.isArray(posts) || posts.length === 0) {
          paging.done = true;
          paging.busy = false;
          hidePagingStatus();
          if (isFirst) hideLoadingOverlay();
          return;
        }

        const grid = getOrMountGrid();
        const frag = document.createDocumentFragment();
        let added = 0;

        for (let i = 0; i < posts.length; i++) {
          const post = posts[i];
          if (isCartoon(post)) continue;
          // Cache post for faster detail view later (perf1)
          postCache.set(post.id, post);
          if (seenIds.has(post.id)) continue;
          const card = makeCard(post);
          if (card) {
            frag.appendChild(card);
            added++;
          }
        }

        if (!added) {
          paging.page++;
          paging.busy = false;
          hidePagingStatus();
          if (!paging.done) loadMorePosts();
          if (isFirst) hideLoadingOverlay();
          return;
        }

        grid.appendChild(frag);

        paging.page++;
        paging.busy = false;
        hidePagingStatus();

        applyGridObserver();
        enforceGridLayout();
        if (isFirst) hideLoadingOverlay();
      })
      .catch(function (err) {
        console.error('Error loading posts:', err);
        paging.busy = false;
        paging.done = true;
        hidePagingStatus();
        hideLoadingOverlay();
      });
  }

  // ---------- Search ----------
  let searchAbortController = null;
  let lastSearchQuery = '';
  let lastSearchPage = 1;
  let lastSearchDone = false;
  let searchBusy = false;

  function renderSearchView() {
    window.onscroll = null;
    paging.done = true;
    paging.busy = false;
    hidePagingStatus();

    app.innerHTML = `
      <section class="search-view">
        <div class="search-bar">
          <input type="text" id="search-input" placeholder="Search posts..." />
          <button id="search-button" type="button">Search</button>
        </div>
        <div id="search-status"></div>
        <div class="posts-grid search-grid"></div>
        <div id="search-sentinel" aria-hidden="true"></div>
      </section>
    `;

    const input = document.getElementById('search-input');
    const button = document.getElementById('search-button');
    const status = document.getElementById('search-status');
    const grid = app.querySelector('.search-grid');
    const sentinel = document.getElementById('search-sentinel');

    if (input) input.focus();

    lastSearchQuery = '';
    lastSearchPage = 1;
    lastSearchDone = false;
    searchBusy = false;

    function setStatus(text, isSearching) {
      status.innerHTML = text;
      if (isSearching) {
        status.innerHTML =
          '<div class="searching-indicator"><div class="spinner"></div><span>Searching…</span></div>';
      }
    }

    function doSearch(resetPage) {
      const q = (input.value || '').trim();
      if (!q) {
        grid.innerHTML = '';
        setStatus('', false);
        return;
      }

      if (resetPage) {
        grid.innerHTML = '';
        lastSearchPage = 1;
        lastSearchDone = false;
      }

      if (searchBusy || lastSearchDone) return;

      if (searchAbortController) {
        searchAbortController.abort();
      }
      searchAbortController = new AbortController();
      const signal = searchAbortController.signal;

      searchBusy = true;
      setStatus('', true);

      const url =
        API +
        '/posts?search=' +
        encodeURIComponent(q) +
        '&per_page=15&page=' +
        lastSearchPage +
        '&_embed=1&orderby=date&order=desc'; // <-- fixed closing quote

      fetch(url, { signal })
        .then(function (r) {
          if (!r.ok) {
            if (r.status === 400) {
              lastSearchDone = true;
              return [];
            }
            throw new Error('Search failed');
          }
          const total = r.headers.get('X-WP-Total');
          if (total === '0') {
            lastSearchDone = true;
          }
          return r.json();
        })
        .then(function (posts) {
          if (!Array.isArray(posts) || posts.length === 0) {
            if (lastSearchPage === 1) {
              setStatus('No results found.', false);
            } else {
              setStatus('No more results.', false);
            }
            lastSearchDone = true;
            return;
          }

          const frag = document.createDocumentFragment();
          let added = 0;

          posts.forEach(function (post) {
            if (isCartoon(post)) return;
            // Cache search results for detail view reuse (perf1)
            postCache.set(post.id, post);
            const card = makeCard(post);
            if (card) {
              frag.appendChild(card);
              added++;
            }
          });

          if (!added && !grid.children.length) {
            setStatus('No results found.', false);
            lastSearchDone = true;
            return;
          }

          grid.appendChild(frag);
          setStatus('', false);
          lastSearchPage++;
        })
        .catch(function (err) {
          if (err.name === 'AbortError') return;
          console.error('Search error:', err);
          setStatus('Error searching posts.', false);
        })
        .finally(function () {
          searchBusy = false;
          if (searchObserver && !lastSearchDone) {
            searchObserver.observe(sentinel);
          }
        });
    }

    button.addEventListener('click', function () {
      doSearch(true);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearch(true);
      }
    });

    let searchObserver = null;
    searchObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            doSearch(false);
          }
        });
      },
      {
        root: null,
        rootMargin: '0px 0px 400px 0px',
        threshold: 0.1,
      }
    );
    searchObserver.observe(sentinel);
  }

  // ---------- About ----------
  function renderAbout() {
    window.onscroll = null;
    paging.done = true;
    paging.busy = false;
    hidePagingStatus();
    if (typeof stopTTS === 'function') {
      stopTTS();
    }
    app.innerHTML = `
      <article class="post-detail about-page">
        <div class="about-grid">
          <section class="about-card about-contact">
            <h1>Contact Us</h1>
            <p>Have a question, story tip, or subscription issue? Email us at <a href="mailto:info@okobserver.net">info@okobserver.net</a> and we’ll respond during normal business hours.</p>
            <div class="about-image-wrap">
              <img src="https://b359822.smushcdn.com/359822/wp-content/uploads/2022/07/Contact-Us-600x375.jpg?lossy=1&amp;strip=1&amp;webp=1" alt="Contact us key on a computer keyboard">
            </div>
          </section>
          <section class="about-card about-mission">
            <div class="about-logo-wrap">
              <img src="logo.png" alt="The Oklahoma Observer logo" class="about-logo">
            </div>
            <h1>About The Oklahoma Observer</h1>
            <div class="about-image-wrap">
              <img src="https://b359822.smushcdn.com/359822/wp-content/uploads/2008/11/Frosty-Arnold-300x172.jpg?lossy=1&amp;strip=1&amp;webp=1" alt="Frosty Troy and Arnold Hamilton at the Oklahoma Capitol">
            </div>
            <p>For more than half a century, The Oklahoma Observer has provided independent reporting, commentary, and analysis for readers who want more than the state’s usual media coverage. Our mission is to comfort people who are hurting and challenge those who hold power.</p>
            <p>We focus on Oklahoma government, politics, and public life, with special attention to public education, health and human services, civil liberties, and the separation of church and state. The Observer is often described as a conscience for Oklahoma because we shine light on hypocrisy and corruption wherever it appears.</p>
            <p>The Observer began under Father John Joyce, then was transformed into an award-winning independent journal under Frosty and Helen Troy. Since 2006, Arnold and Beverly Hamilton have carried the work forward into the magazine’s second century, publishing the Observer each month in print and online.</p>
          </section>
          <section class="about-card about-editor">
            <h1>Arnold Hamilton, Editor</h1>
            <div class="about-image-wrap">
              <img src="https://b359822.smushcdn.com/359822/wp-content/uploads/2018/01/Arnold-Dec17-1000x-191x300.jpg?lossy=1&amp;strip=1&amp;webp=1" alt="Arnold Hamilton, editor of The Oklahoma Observer">
            </div>
            <p>Arnold Hamilton has led The Oklahoma Observer as editor since 2006. Before joining the Observer, he spent more than three decades in daily newspapers, reporting for outlets including the Dallas Morning News, San Jose Mercury News, Dallas Times Herald, Tulsa Tribune, and Oklahoma Journal.</p>
            <p>His work has focused on politics and government at the state Capitols of Oklahoma, Texas, and California, as well as national campaigns and party conventions. Hamilton’s reporting has earned multiple honors, including awards for his coverage of the Oklahoma City bombing, major college sports scandals, and civil liberties issues. He is a member of the Oklahoma Journalism Hall of Fame.</p>
          </section>
        </div>
      </article>
    `;
    document.title = 'About – The Oklahoma Observer';
  }

  // --- TTS helper: build & attach the listen button (chunked playback) ---
  function setupListenButton(titleEl, bylineEl, bodyEl) {
    if (!titleEl || !bylineEl || !bodyEl) return;

    const btn = document.createElement('span');
    btn.className = 'listen-btn';
    btn.innerHTML = '🔊';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', 'Listen to this article');

    // Touch-friendly styling inline to avoid CSS changes
    btn.style.background = 'none';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '1.6rem';
    btn.style.margin = '10px 0 6px 0';
    btn.style.padding = '6px 10px';
    btn.style.borderRadius = '999px';
    btn.style.color = '#1E90FF';
    btn.style.display = 'inline-block';
    btn.style.lineHeight = '1.2';
    btn.style.touchAction = 'manipulation';
    btn.style.webkitTapHighlightColor = 'rgba(0,0,0,0)';
    btn.style.opacity = '1';

    const row = document.createElement('div');
    row.className = 'listen-row';
    row.appendChild(btn);
    bylineEl.insertAdjacentElement('afterend', row);

    const supported = 'speechSynthesis' in window;
    if (!supported) {
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.title = 'Listening is not supported in this browser.';
      return;
    }

    // Build an array of smaller segments from the article text
    function buildSegments() {
      const textParts = [];
      const t = (titleEl.textContent || '').trim();
      const b = (bylineEl.textContent || '').trim();
      const bodyText = (bodyEl.textContent || '').trim();

      if (t) textParts.push(t + '.');
      if (b) textParts.push(b + '.');
      if (bodyText) textParts.push(bodyText);

      let fullText = textParts.join(' ');
      if (!fullText) return [];

      // Normalize whitespace
      fullText = fullText.replace(/\s+/g, ' ').trim();

      const segments = [];
      const maxChunk = 1800; // keep chunks modest so mobile TTS doesn't choke

      while (fullText.length > 0) {
        if (fullText.length <= maxChunk) {
          segments.push(fullText);
          break;
        }

        const slice = fullText.slice(0, maxChunk);

        // Prefer to break at sentence boundaries, then at last space
        let cut = slice.lastIndexOf('. ');
        const qIndex = slice.lastIndexOf('? ');
        const exIndex = slice.lastIndexOf('! ');

        if (qIndex > cut) cut = qIndex;
        if (exIndex > cut) cut = exIndex;

        if (cut <= 0) {
          cut = slice.lastIndexOf(' ');
        }
        if (cut <= 0) {
          cut = maxChunk;
        }

        const segment = slice.slice(0, cut + 1).trim();
        segments.push(segment);
        fullText = fullText.slice(cut + 1).trim();
      }

      return segments;
    }

    function speakNextSegment() {
      if (!ttsSegments || ttsSegmentIndex >= ttsSegments.length) {
        // Finished all segments
        ttsCurrentUtterance = null;
        ttsIsPaused = false;
        ttsSegments = null;
        ttsSegmentIndex = 0;
        btn.style.opacity = '1';
        return;
      }

      const text = ttsSegments[ttsSegmentIndex];
      const utterance = new SpeechSynthesisUtterance(text);
      ttsCurrentUtterance = utterance;
      ttsIsPaused = false;
      btn.style.opacity = '1';

      utterance.onend = function () {
        ttsCurrentUtterance = null;
        if (ttsIsPaused) {
          // User paused; don't auto-advance
          btn.style.opacity = '0.6';
          return;
        }
        ttsSegmentIndex += 1;
        speakNextSegment();
      };

      utterance.onerror = function () {
        ttsCurrentUtterance = null;
        ttsIsPaused = false;
        btn.style.opacity = '1';
      };

      window.speechSynthesis.speak(utterance);
    }

    function handleActivate() {
      if (!('speechSynthesis' in window)) return;

      // If something left a stale utterance, clear it
      if (
        ttsCurrentUtterance &&
        !window.speechSynthesis.speaking &&
        !ttsIsPaused
      ) {
        ttsCurrentUtterance = null;
      }

      // Start or restart from the beginning
      if (!ttsCurrentUtterance && !ttsIsPaused) {
        if (!ttsSegments) {
          ttsSegments = buildSegments();
          ttsSegmentIndex = 0;
        }
        if (!ttsSegments || !ttsSegments.length) return;
        speakNextSegment();
        return;
      }

      // Pause if currently playing
      if (!ttsIsPaused) {
        try {
          window.speechSynthesis.pause();
        } catch (e) {
          // ignore
        }
        ttsIsPaused = true;
        btn.style.opacity = '0.6';
        return;
      }

      // Resume if paused
      try {
        window.speechSynthesis.resume();
      } catch (e) {
        // ignore
      }
      ttsIsPaused = false;
      btn.style.opacity = '1';
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      handleActivate();
    });

    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        handleActivate();
      }
    });
  }

  // ---------- Detail ----------
  function renderDetail(id) {
    window.onscroll = null;
    paging.done = true;
    paging.busy = false;
    hidePagingStatus();
    stopTTS();

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

    // Helper to populate the detail view from a post object (extracted from original .then)
    function renderPostDetail(post) {
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

      tidyArticleSpacing(bodyEl);

      const videoSlot = app.querySelector('.video-slot');
      let candidate = findVideoUrl(bodyHTML);

      // Special Vimeo overrides
      if (post.id === 381733) {
        const m381733 = bodyHTML.match(
          /https?:\/\/(?:www\.)?vimeo\.com\/1126193804\b/
        );
        if (m381733 && m381733[0]) {
          candidate = m381733[0];
        } else if (!candidate) {
          candidate = 'https://vimeo.com/1126193804';
        }
      }

      if (post.id === 383136) {
        const m383136 = bodyHTML.match(
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
        if (heroWrap && hero) {
          heroWrap.style.borderRadius = '12px';
          heroWrap.style.overflow = 'hidden';
          heroWrap.style.boxShadow = '0 8px 22px rgba(0,0,0,.15)';
          hero.style.display = 'block';
          hero.style.width = '100%';
          hero.style.height = 'auto';

          const btn = document.createElement('a');
          btn.href = candidate;
          btn.target = '_blank';
          btn.rel = 'noopener';
          btn.textContent = 'Watch on Facebook ↗';
          btn.setAttribute('aria-label', 'Watch on Facebook');
          Object.assign(btn.style, {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            background: '#1E90FF',
            color: '#fff',
            padding: '12px 18px',
            borderRadius: '999px',
            textDecoration: 'none',
            fontWeight: '700',
            boxShadow: '0 2px 10px rgba(0,0,0,.25)',
          });
          heroWrap.appendChild(btn);
        }
        scrubLeadingEmbedPlaceholders(bodyEl, candidate);
      } else {
        const embed = buildEmbed(candidate, post.id);
        if (embed) {
          videoSlot.style.display = 'none';
          videoSlot.innerHTML = embed + (buildExternalCTA(candidate) || '');
          const iframe = videoSlot.querySelector('iframe');
          let shown = false;
          const showNow = function () {
            if (shown) return;
            shown = true;
            videoSlot.style.display = 'block';
            scrubLeadingEmbedPlaceholders(bodyEl, candidate);
          };
          const giveUp = function () {
            if (shown) return;
          };
          iframe && iframe.addEventListener('load', showNow, { once: true });
          setTimeout(showNow, 600);
          setTimeout(giveUp, 4000);
        }
      }

      const tagsRow = buildTagsRow(post);
      if (tagsRow) {
        const backRow = app.querySelector('.back-row');
        if (backRow && backRow.parentNode) {
          backRow.parentNode.insertBefore(tagsRow, backRow);
        }
      }

      setupListenButton(titleEl, bylineEl, bodyEl);

      requestAnimationFrame(function () {
        detailEl.style.visibility = 'visible';
        detailEl.style.minHeight = '';
      });
    }

    // Try cache first (perf1)
    const cached = postCache.get(postId);
    if (cached && cached.id) {
      try {
        renderPostDetail(cached);
        return;
      } catch (e) {
        console.error(
          '[OkObserver] Error rendering detail from cache, falling back to network',
          e
        );
      }
    }

    // Fallback to network fetch
    fetchJson(API + '/posts/' + postId + '?_embed=1')
      .then(function (post) {
        // Cache fresh detail payload for future visits
        if (post && post.id) {
          postCache.set(post.id, post);
        }
        renderPostDetail(post);
      })
      .catch(function () {
        document.title = 'Post – The Oklahoma Observer';
        const b = app.querySelector('.post-body');
        if (b) b.textContent = 'Post not found.';
        requestAnimationFrame(function () {
          const d = app.querySelector('.post-detail');
          if (d) {
            d.style.visibility = 'visible';
            d.style.minHeight = '';
          }
        });
      });
  }

  // ---------- Video Helpers ----------
  function findVideoUrl(html) {
    if (!html) return null;
    let m = html.match(/https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/);
    if (m) return m[0];
    m = html.match(/https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{6,})/);
    if (m) return m[0];
    m = html.match(
      /https?:\/\/(?:www\.)?youtube\.com\/watch\?[^"']*v=([A-Za-z0-9_-]{6,})/
    );
    if (m) return m[0];
    m = html.match(
      /https?:\/\/(?:www\.)?facebook\.com\/[^"'\s]+\/videos\/(\d+)/i
    );
    if (m) return m[0];
    m = html.match(/https?:\/\/(?:www\.)?facebook\.com\/[^"'\s]+/i);
    if (m) return m[0];
    return null;
  }

  function buildEmbed(url /*, postId */) {
    if (!url) return '';
    let m = url.match(/vimeo\.com\/(\d+)/);
    if (m) {
      const vid = m[1];
      return (
        '<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">' +
        '<iframe src="https://player.vimeo.com/video/' +
        vid +
        '" title="Vimeo video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;" loading="lazy"></iframe>' +
        '</div>'
      );
    }
    m = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
    if (m) {
      const vid2 = m[1];
      return (
        '<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">' +
        '<iframe src="https://www.youtube.com/embed/' +
        vid2 +
        '?rel=0" title="YouTube video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;" loading="lazy"></iframe>' +
        '</div>'
      );
    }
    m = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (m) {
      const vid3 = m[1];
      return (
        '<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">' +
        '<iframe src="https://www.youtube.com/embed/' +
        vid3 +
        '?rel=0" title="YouTube video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;" loading="lazy"></iframe>' +
        '</div>'
      );
    }
    m = url.match(/facebook\.com\/[^"'\s]+\/videos\/(\d+)/i);
    if (m) {
      return '';
    }
    return '';
  }

  function buildExternalCTA(url) {
    if (!url) return '';
    if (/facebook\.com/i.test(url)) return '';
    const isYT = /youtu(?:\.be|be\.com)/i.test(url);
    const isVM = /vimeo\.com/i.test(url);
    const label =
      isYT ? 'Watch on YouTube' : isVM ? 'Watch on Vimeo' : 'Open Video';
    return (
      '<div class="ext-cta" style="margin-top:12px">' +
      '<a href="' +
      url +
      '" target="_blank" rel="noopener" style="display:inline-block;background:#1E90FF;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:600;">' +
      label +
      ' ↗</a></div>'
    );
  }

  function tidyArticleSpacing(container) {
    if (!container) return;
    const kids = Array.prototype.slice.call(container.children || []);
    while (kids.length && isTrimmableBlock(kids[0])) {
      container.removeChild(kids.shift());
    }
  }

  function isTrimmableBlock(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (
      tag === 'P' ||
      tag === 'DIV' ||
      tag === 'FIGURE' ||
      tag === 'SPAN' ||
      tag === 'SECTION'
    ) {
      const text = (el.textContent || '').trim();
      const hasIframe = !!el.querySelector('iframe, video');
      const style = (el.getAttribute('style') || '').toLowerCase();
      const looksLikeAspect =
        /padding-top:\s*(?:56\.25%|75%|62\.5%|[3-8]\d%)/i.test(style) &&
        !hasIframe;

      if (!text && looksLikeAspect) return true;
      if (!text && !hasIframe) return true;
    }
    return false;
  }

  function scrubLeadingEmbedPlaceholders(container, urlCandidate) {
    let changed = false;

    while (container.firstElementChild) {
      const el = container.firstElementChild;
      const cls = (el.className || '') + '';
      const html = el.innerHTML || '';
      const hasIframe = !!el.querySelector('iframe, video');
      const textContent = el.textContent || '';

      const isWpEmbed =
        /\bwp-block-embed\b/.test(cls) ||
        /\bwp-block-video\b/.test(cls) ||
        /\bwp-embed-aspect\b/.test(cls);

      const isVideoLinkPara =
        el.tagName === 'P' &&
        /https?:\/\/(www\.)?(vimeo\.com|youtu\.be|youtube\.com|facebook\.com)\//i.test(
          textContent
        );

      let containsCandidate = false;
      if (urlCandidate) {
        if (
          html.indexOf(urlCandidate) !== -1 ||
          textContent.indexOf(urlCandidate) !== -1
        ) {
          containsCandidate = true;
        }
      }

      const urlRegex = /https?:\/\/[^\s]+/gi;
      const stripped = textContent.replace(urlRegex, '').trim();
      const onlyUrls = !stripped && urlRegex.test(textContent);

      const style = (el.getAttribute('style') || '').toLowerCase();
      const looksLikeAspect =
        /padding-top:\s*(?:56\.25%|75%|62\.5%|[3-8]\d%)/i.test(style) &&
        !hasIframe;

      if (
        isWpEmbed ||
        isVideoLinkPara ||
        onlyUrls ||
        (looksLikeAspect && containsCandidate)
      ) {
        container.removeChild(el);
        changed = true;
        continue;
      }

      break;
    }

    if (changed) {
      const kids = Array.prototype.slice.call(container.children || []);
      while (kids.length && isTrimmableBlock(kids[0])) {
        container.removeChild(kids.shift());
      }
    }
  }

  function buildTagsRow(post) {
    if (!post || !post._embedded || !post._embedded['wp:term']) return null;
    const termGroups = post._embedded['wp:term'];
    const tags = [];

    for (let i = 0; i < termGroups.length; i++) {
      const group = termGroups[i];
      if (!Array.isArray(group)) continue;
      group.forEach(function (term) {
        if (term && term.taxonomy === 'post_tag') tags.push(term);
      });
    }

    if (!tags.length) return null;

    const row = document.createElement('div');
    row.className = 'tags-row';
    row.setAttribute('aria-label', 'Post tags');

    tags.forEach(function (tag) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = tag.name;
      row.appendChild(chip);
    });

    return row;
  }

  // ---------- Header / Hamburger ----------
  function initHeaderNav() {
    if (headerNavInitialized) return;
    headerNavInitialized = true;

    const hamburger = document.querySelector('[data-oo="hamburger"]');
    const overlay = document.querySelector('[data-oo="overlay"]');
    const menu = document.querySelector('[data-oo="menu"]');

    if (!hamburger || !overlay || !menu) return;

    function openMenu() {
      overlay.hidden = false;
      menu.hidden = false;
      document.body.classList.add('oo-menu-open', 'is-menu-open');
      hamburger.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
      overlay.hidden = true;
      menu.hidden = true;
      document.body.classList.remove('oo-menu-open', 'is-menu-open');
      hamburger.setAttribute('aria-expanded', 'false');
    }

    function toggleMenu() {
      const isOpen = !overlay.hidden;
      if (isOpen) closeMenu();
      else openMenu();
    }

    hamburger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });

    overlay.addEventListener('click', function (e) {
      e.preventDefault();
      closeMenu();
    });

    menu.addEventListener('click', function (e) {
      const t = e.target;
      if (t && t.tagName === 'A') {
        closeMenu();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        closeMenu();
      }
    });

    window.addEventListener('hashchange', closeMenu);
  }

  // ---------- Router + scroll snapshot ----------
  function handleHashChange() {
    const newHash = window.location.hash || '#/';
    the prevHash = lastHash || '#/';

    const prevWasHome = prevHash === '#/' || prevHash === '';
    const nextIsHome = newHash === '#/' || newHash === '';
    if (prevWasHome && !nextIsHome) {
      const grid = app.querySelector('.posts-grid');
      if (grid) {
        homeState.hasState = true;
        homeState.gridHTML = grid.innerHTML;
        homeState.paging = {
          page: paging.page,
          busy: paging.busy,
          done: paging.done,
        };
        homeState.scrollY = window.scrollY || 0;
      }
    }

    if (nextIsHome) {
      renderHome();
    } else if (newHash === '#/about') {
      renderAbout();
    } else if (newHash === '#/search') {
      renderSearchView();
    } else if (newHash.indexOf('#/post/') === 0) {
      const id = newHash.replace('#/post/', '');
      renderDetail(id);
    } else {
      renderHome();
    }

    lastHash = newHash;
  }

  window.addEventListener('hashchange', handleHashChange);

  window.addEventListener('hashchange', function () {
    stopTTS();
  });

  // ---------- Motto Click Guard ----------
  document.addEventListener(
    'click',
    function (e) {
      const motto = document.querySelector('.oo-motto');
      if (!motto) return;
      if (motto.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  // ---------- Init ----------
  initHeaderNav();
  handleHashChange();

  // ---------- WP lazyload iframe scrubber ----------
  function removeLazyloadEmbeds() {
    const body = document.querySelector('.post-detail .post-body');
    if (!body) return;

    const lazyIframes = body.querySelectorAll(
      'iframe.lazyload, iframe[data-src]'
    );
    lazyIframes.forEach(function (ifr) {
      const ds = ifr.getAttribute('data-src') || '';
      if (!ds) {
        if (ifr.parentNode) ifr.parentNode.removeChild(ifr);
        return;
      }
      if (/vimeo\.com|youtube\.com|youtu\.be|facebook\.com/i.test(ds)) {
        ifr.setAttribute('src', ds);
        ifr.removeAttribute('data-src');
        ifr.classList.remove('lazyload');
      } else if (ifr.parentNode) {
        ifr.parentNode.removeChild(ifr);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
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

// 🔴 main.js — end of file (loaderSafe2 + scrollRestoreFix1 + TTS chunked + pagingUX1 + perf2-ttsChunks)
