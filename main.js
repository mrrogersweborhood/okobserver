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
    paging: null,
  };

  const paging = {
    page: 1,
    busy: false,
    done: false,
  };

  let seenIds = new Set();
  window.__OKOBS_DUP_GUARD_ENABLED__ = false;

  // --------- Utilities ---------
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
        rootMargin: '0px 0px 400px 0px',
        threshold: 0.1,
      }
    );
    pagingObserver.observe(sentinel);
  }

  // Observe changes in the grid to enforce 4/3/1 columns
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

    if (homeState.hasState && homeState.gridHTML) {
      grid.innerHTML = homeState.gridHTML;
      Object.assign(paging, homeState.paging || {});
      applyGridObserver();
      enforceGridLayout();
      requestAnimationFrame(function () {
        window.scrollTo(0, homeState.scrollY || 0);
      });
      return;
    }

    grid.innerHTML = '';
    paging.page = 1;
    paging.busy = false;
    paging.done = false;
    seenIds = new Set();

    loadMorePosts(true);
  }

  let pagingObserver = null;

  function loadMorePosts(isFirst) {
    if (paging.busy || paging.done) return;
    paging.busy = true;

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
          return;
        }

        const grid = getOrMountGrid();
        const frag = document.createDocumentFragment();
        let added = 0;

        for (let i = 0; i < posts.length; i++) {
          const post = posts[i];
          if (isCartoon(post)) continue;
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
          if (!paging.done) {
            loadMorePosts();
          }
          return;
        }

        grid.appendChild(frag);

        paging.page++;
        paging.busy = false;

        applyGridObserver();
        enforceGridLayout();
      })
      .catch(function (err) {
        console.error('Error loading posts:', err);
        paging.busy = false;
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
          '<div class="searching-indicator">' +
          '<div class="spinner"></div>' +
          '<span>Searching…</span>' +
          '</div>';
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
        '&_embed=1&orderby=date&order=desc';

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
    app.innerHTML =
      '<div class="post-detail"><h1>About</h1><p>The Oklahoma Observer is a fiercely independent journal of commentary, reporting, analysis, and advocacy devoted to progressive values, transparency, and fairness in Oklahoma politics and public life.</p></div>';
    document.title = 'About – The Oklahoma Observer';
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

// Special case: post 381733 — ensure we use the correct Vimeo URL
    if (post.id === 381733) {
      var m381733 = bodyHTML.match(/https?:\/\/(?:www\.)?vimeo\.com\/1126193804\b/);
      if (m381733 && m381733[0]) {
        candidate = m381733[0];
      } else if (!candidate) {
        candidate = 'https://vimeo.com/1126193804';
      }
    }
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
            videoSlot.innerHTML =
              embed + (buildExternalCTA(candidate) || '');
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
            iframe &&
              iframe.addEventListener('load', showNow, { once: true });
            setTimeout(showNow, 600);
            setTimeout(giveUp, 4000);
          } else {
            // No custom embed built; leave WP’s own embed (player) in place.
            // tidyArticleSpacing has already removed empty junk, so we skip
            // extra scrubbing here to avoid nuking a working player.
          }
        }

        // Insert tags row (pill chips) before the Back button, if tags exist
        const tagsRow = buildTagsRow(post);
        if (tagsRow) {
          const backRow = app.querySelector('.back-row');
          if (backRow && backRow.parentNode) {
            backRow.parentNode.insertBefore(tagsRow, backRow);
          }
        }

        requestAnimationFrame(function () {
          detailEl.style.visibility = 'visible';
          detailEl.style.minHeight = '';
        });
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

  function buildEmbed(url, postId) {
    if (!url) return '';
    let m = url.match(/vimeo\.com\/(\d+)/);
    if (m) {
      const vid = m[1];
      return (
        '<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">' +
        '\n              <iframe src="https://player.vimeo.com/video/' +
        vid +
        '" title="Vimeo video"\n                  allow="autoplay; fullscreen; picture-in-picture"\n                  allowfullscreen\n                  style="position:absolute;top:0;left:0;width:100%;height:100%;" loading="lazy"></iframe>\n              </div>'
      );
    }
    m = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
    if (m) {
      const vid2 = m[1];
      return (
        '<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">' +
        '\n              <iframe src="https://www.youtube.com/embed/' +
        vid2 +
        '?rel=0" title="YouTube video"\n                  allow="autoplay; encrypted-media; picture-in-picture"\n                  allowfullscreen\n                  style="position:absolute;top:0;left:0;width:100%;height:100%;" loading="lazy"></iframe>\n              </div>'
      );
    }
    m = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (m) {
      const vid3 = m[1];
      return (
        '<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">' +
        '\n              <iframe src="https://www.youtube.com/embed/' +
        vid3 +
        '?rel=0" title="YouTube video"\n                  allow="autoplay; encrypted-media; picture-in-picture"\n                  allowfullscreen\n                  style="position:absolute;top:0;left:0;width:100%;height:100%;" loading="lazy"></iframe>\n              </div>'
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
    const label = isYT
      ? 'Watch on YouTube'
      : isVM
      ? 'Watch on Vimeo'
      : 'Open Video';
    return (
      '\n      <div class="ext-cta" style="margin-top:12px">\n        <a href="' +
      url +
      '" target="_blank" rel="noopener"\n           style="display:inline-block;background:#1E90FF;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:600;">' +
      label +
      ' ↗</a>\n      </div>'
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

      if (!text && looksLikeAspect) {
        return true;
      }
      if (!text && !hasIframe) {
        return true;
      }
    }
    return false;
  }

  // Remove leading embed placeholders in the body that correspond to our candidate URL
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

  // Build tags row (pill chips)
  function buildTagsRow(post) {
    if (!post || !post._embedded || !post._embedded['wp:term']) return null;
    const termGroups = post._embedded['wp:term'];
    let tags = [];

    for (let i = 0; i < termGroups.length; i++) {
      const group = termGroups[i];
      if (!Array.isArray(group)) continue;
      group.forEach(function (term) {
        if (term && term.taxonomy === 'post_tag') {
          tags.push(term);
        }
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

  // ---------- Router ----------
  function handleHashChange() {
    const hash = window.location.hash || '#/';
    if (hash === '#/' || hash === '') {
      homeState.hasState = true;
      const grid = app.querySelector('.posts-grid');
      if (grid) {
        homeState.gridHTML = grid.innerHTML;
        homeState.paging = {
          page: paging.page,
          busy: paging.busy,
          done: paging.done,
        };
      }
      homeState.scrollY = window.scrollY || 0;
      renderHome();
    } else if (hash === '#/about') {
      renderAbout();
    } else if (hash === '#/search') {
      renderSearchView();
    } else if (hash.indexOf('#/post/') === 0) {
      const id = hash.replace('#/post/', '');
      renderDetail(id);
    } else {
      renderHome();
    }
  }

  window.addEventListener('hashchange', handleHashChange);

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
  handleHashChange();

  // ---------- WP lazyload iframe scrubber ----------
  function removeLazyloadEmbeds() {
    const body = document.querySelector('.post-detail .post-body');
    if (!body) return;

    const lazyIframes = body.querySelectorAll('iframe.lazyload, iframe[data-src]');
    lazyIframes.forEach(function (ifr) {
      const ds = ifr.getAttribute('data-src') || '';
      if (!ds) {
        ifr.parentNode && ifr.parentNode.removeChild(ifr);
        return;
      }
      if (/vimeo\.com|youtube\.com|youtu\.be|facebook\.com/i.test(ds)) {
        ifr.setAttribute('src', ds);
        ifr.removeAttribute('data-src');
        ifr.classList.remove('lazyload');
      } else {
        ifr.parentNode && ifr.parentNode.removeChild(ifr);
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
// 🔴 main.js — end of full file (includes remove WP lazyload iframes helper v2025-11-19R1)