// 🟢 main.js — start of full file
// OkObserver Main JS — Build 2025-11-16R2-rememberHome+381733BodyHide

(function () {
  'use strict';
  const BUILD = '2025-11-16R2-rememberHome+381733BodyHide';
  console.log('[OkObserver] Main JS Build', BUILD);

  const API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  let app = document.getElementById('app');

  // Home view state cache (for return-to-summary)
  const homeState = {
    hasState: false,
    scrollY: 0,
    gridHTML: '',
    seenIds: [],
    page: 1,
    done: false,
  };

  let lastHash = '#/';

  // ---------- Router ----------
  window.addEventListener('hashchange', route);
  window.addEventListener('load', route);

  function isHome() {
    return (location.hash || '#/') === '#/';
  }

  function route() {
    const hash = location.hash || '#/';

    // If we are leaving home for a post detail, capture current home state
    if (lastHash === '#/' && hash.startsWith('#/post/')) {
      saveHomeState();
    }
    lastHash = hash;

    if (hash.startsWith('#/post/')) {
      renderDetail(+hash.split('/')[2]);
    } else if (hash.startsWith('#/about')) {
      renderAbout();
    } else {
      renderHome();
    }

    document.dispatchEvent(new CustomEvent('okobs:route', { detail: { hash } }));
  }

  window.__ok_route = function (h) {
    if (h) location.hash = h;
    route();
  };

  // ---------- Home ----------
  const paging = { page: 1, busy: false, done: false };
  const seenIds = new Set();
  let DISABLE_CARTOON_FILTER = false;
  // Scroll throttle flag for onScroll → loadMore
  let scrollTicking = false;

  window.__ok_disableCartoonFilter = function (on) {
    if (on === void 0) on = true;
    DISABLE_CARTOON_FILTER = !!on;
    location.hash = '#/';
    route();
  };

  function getOrMountGrid() {
    if (!app) app = document.getElementById('app');
    let grid = app && app.querySelector('.posts-grid');
    if (!grid) {
      grid = document.createElement('section');
      grid.className = 'posts-grid';
      app.innerHTML = '';
      app.appendChild(grid);
    }
    return grid;
  }

  function makeCard(post) {
    const el = document.createElement('article');
    el.className = 'post-card';

    const title = decodeHtml((post.title && post.title.rendered) || '');
    const date = new Date(post.date);
    const byline =
      (post._embedded &&
        post._embedded.author &&
        post._embedded.author[0] &&
        post._embedded.author[0].name) ||
      'Oklahoma Observer';
    const img =
      (post._embedded &&
        post._embedded['wp:featuredmedia'] &&
        post._embedded['wp:featuredmedia'][0] &&
        post._embedded['wp:featuredmedia'][0].source_url) ||
      '';

    // Preserve anchors anywhere in the excerpt (unwrap others, keep children)
    const excerptHTML = sanitizeExcerptKeepAnchors(
      decodeHtml((post.excerpt && post.excerpt.rendered) || '')
    ).trim();

    el.innerHTML = `
      <a class="thumb" href="#/post/${post.id}" aria-label="${escapeHtmlAttr(title)}">
        ${img ? `<img src="${img}?cb=${post.id}" alt="" loading="lazy" decoding="async">` : ''}
      </a>
      <h2 class="title">
        <a href="#/post/${post.id}">${title}</a>
      </h2>
      <div class="meta">${byline} — ${date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}</div>
      <p class="excerpt">${excerptHTML}</p>
    `;

    // Extra spacing ONLY for post 382365 on the summary grid
    if (post.id === 382365) {
      const titleEl = el.querySelector('h2.title');
      if (titleEl) {
        titleEl.style.marginTop = '40px';
      }
    }

    return el;
  }

  function renderHome() {
    document.title = 'The Oklahoma Observer';
    const grid = getOrMountGrid();
    window.__OKOBS_DUP_GUARD_ENABLED__ = true;

    if (homeState.hasState && homeState.gridHTML) {
      // Restore previous home view
      paging.page = homeState.page;
      paging.busy = false;
      paging.done = homeState.done;

      seenIds.clear();
      homeState.seenIds.forEach(function (id) {
        seenIds.add(String(id));
      });

      grid.innerHTML = homeState.gridHTML;

      window.onscroll = onScroll;
      requestAnimationFrame(function () {
        window.scrollTo(0, homeState.scrollY || 0);
      });
    } else {
      // Fresh load
      paging.page = 1;
      paging.busy = false;
      paging.done = false;
      seenIds.clear();
      grid.innerHTML = '';
      loadMore();
      window.onscroll = onScroll;
    }
  }

  function onScroll() {
    // Throttle scroll handling to animation frames
    if (scrollTicking) return;
    scrollTicking = true;

    window.requestAnimationFrame(function () {
      scrollTicking = false;
      if (paging.busy || paging.done || !isHome()) return;
      const nearBottom =
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000;
      if (nearBottom) loadMore();
    });
  }

  function isCartoonSlugList(cats) {
    return cats.some(function (c) {
      return (c.slug || '').toLowerCase() === 'cartoon';
    });
  }

  function loadMore() {
    if (!isHome() || paging.busy || paging.done) return;
    paging.busy = true;

    fetch(API + '/posts?_embed&per_page=12&page=' + paging.page)
      .then(function (r) {
        if (!r.ok) {
          if (r.status === 400 || r.status === 404) paging.done = true;
          throw new Error('no more');
        }
        return r.json();
      })
      .then(function (arr) {
        if (!isHome()) {
          paging.busy = false;
          return;
        }
        const grid =
          document.querySelector('#app .posts-grid') || getOrMountGrid();
        let rendered = 0;
        // Batch DOM updates in a DocumentFragment for smoother appends
        const frag = document.createDocumentFragment();

        arr.forEach(function (p) {
          const id = String(p.id);
          if (seenIds.has(id)) return;

          const cats =
            (p._embedded &&
              p._embedded['wp:term'] &&
              p._embedded['wp:term'][0]) ||
            [];
          if (!window.__OKOBS_DUP_GUARD_ENABLED__ && seenIds.has(id)) return;
          if (!DISABLE_CARTOON_FILTER && isCartoonSlugList(cats)) return;

          const card = makeCard(p);
          if (!isHome()) return;
          frag.appendChild(card);
          seenIds.add(id);
          rendered++;
        });

        if (!isHome()) {
          paging.busy = false;
          return;
        }

        if (rendered > 0) {
          (document.querySelector('#app .posts-grid') || grid).appendChild(frag);
        }

        paging.page += 1;
        paging.busy = false;
        if (arr.length === 0 || rendered === 0) paging.done = true;
      })
      .catch(function () {
        paging.busy = false;
        paging.done = true;
      });
  }

  // Capture current home grid + scroll so we can restore later
  function saveHomeState() {
    try {
      const grid = document.querySelector('#app .posts-grid');
      if (!grid) {
        homeState.hasState = false;
        return;
      }
      homeState.scrollY = window.scrollY || 0;
      homeState.gridHTML = grid.innerHTML;
      homeState.page = paging.page;
      homeState.done = paging.done;
      homeState.seenIds = Array.from(seenIds);
      homeState.hasState = true;
    } catch (e) {
      console.warn('[OkObserver] saveHomeState failed:', e);
      homeState.hasState = false;
    }
  }

  // ---------- About ----------
  function renderAbout() {
    window.onscroll = null;
    paging.done = true;
    paging.busy = false;
    app.innerHTML =
      '<div class="post-detail"><h1>About</h1><p>The Oklahoma Observer…</p></div>';
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

    fetch(API + '/posts/' + id + '?_embed')
      .then(function (r) {
        return r.json();
      })
      .then(function (post) {
        const detailEl = app.querySelector('.post-detail');
        const heroWrap = app.querySelector('.hero-wrap');
        const hero = app.querySelector('.hero');
        const titleEl = app.querySelector('.detail-title');
        const bylineEl = app.querySelector('.detail-byline');
        const bodyEl = app.querySelector('.post-body');

        const title = decodeHtml(
          (post.title && post.title.rendered) || ''
        );
        document.title = title + ' – The Oklahoma Observer';

        titleEl.textContent = title;
        bylineEl.textContent = buildByline(post);

        const img =
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
        const candidate = findVideoUrl(bodyHTML);
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
              shown = true;
              videoSlot.style.display = 'block';
              scrubLeadingEmbedPlaceholders(bodyEl, candidate);
            };
            iframe &&
              iframe.addEventListener('load', showNow, { once: true });
            setTimeout(showNow, 600);
            setTimeout(giveUp, 4000);
          } else {
            scrubLeadingEmbedPlaceholders(bodyEl, candidate);
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

        // Special-case: hide empty post body ONLY for post 381733
        if (post.id === 381733) {
          collapseIfEmptyBody(bodyEl);
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

  function buildByline(post) {
    const by =
      (post._embedded &&
        post._embedded.author &&
        post._embedded.author[0] &&
        post._embedded.author[0].name) ||
      'Oklahoma Observer';
    const dt = new Date(post.date);
    return (
      by +
      ' — ' +
      dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    );
  }

  // Build a tag row element from post._embedded['wp:term'] (post_tag only)
  function buildTagsRow(post) {
    if (
      !post ||
      !post._embedded ||
      !post._embedded['wp:term'] ||
      !Array.isArray(post._embedded['wp:term'])
    ) {
      return null;
    }

    const groups = post._embedded['wp:term'];
    const tags = [];

    groups.forEach(function (group) {
      if (!Array.isArray(group)) return;
      group.forEach(function (term) {
        if (term && term.taxonomy === 'post_tag') {
          tags.push(term);
        }
      });
    });

    if (!tags.length) return null;

    const wrap = document.createElement('div');
    wrap.className = 'detail-tags-row';

    tags.forEach(function (tag) {
      const chip = document.createElement('span');
      chip.className = 'detail-tag-pill';
      chip.textContent = tag.name || tag.slug || '';
      wrap.appendChild(chip);
    });

    return wrap;
  }

  // ---- helpers ----
  function decodeHtml(s) {
    if (s === void 0) s = '';
    const el = document.createElement('textarea');
    el.innerHTML = s;
    return el.value;
  }

  function escapeHtmlAttr(s) {
    if (s === void 0) s = '';
    return String(s).replace(/"/g, '&quot;');
  }

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
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener');
            out.push(a.outerHTML);
          } else collect(n);
        }
      });
    })(root);
    return out
      .join('')
      .replace(/\s+\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

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
    m = html.match(
      /https?:\/\/(?:www\.)?facebook\.com\/watch\/?\?[^"'\s]*v=(\d+)/i
    );
    if (m) return m[0];
    return null;
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
      '" target="_blank" rel="noopener"\n           style="display:inline-block;background:#1E90FF;color:#fff;padding:10px 16px;border-radius:8px;\n                  text-decoration:none;font-weight:600;box-shadow:0 2px 10px rgba(0,0,0,.08)">\n          ' +
      label +
      ' ↗\n        </a>\n      </div>'
    );
  }

  function buildEmbed(url, postId) {
    if (!url) return '';
    let m = url.match(/vimeo\.com\/(\d+)/);
    if (m) {
      const vid = m[1];
      return (
        '<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">\n                <iframe src="https://player.vimeo.com/video/' +
        vid +
        '" title="Vimeo video"\n                  allow="autoplay; fullscreen; picture-in-picture"\n                  style="position:absolute;inset:0;border:0;width:100%;height:100%;" loading="lazy"></iframe>\n              </div>'
      );
    }
    m = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
    if (m) {
      const vid2 = m[1];
      return (
        '<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">\n                <iframe src="https://www.youtube.com/embed/' +
        vid2 +
        '?rel=0" title="YouTube video"\n                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"\n                  style="position:absolute;inset:0;border:0;width:100%;height:100%;"\n                  loading="lazy" allowfullscreen></iframe>\n              </div>'
      );
    }
    m = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (m) {
      const vid3 = m[1];
      return (
        '<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">\n                <iframe src="https://www.youtube.com/embed/' +
        vid3 +
        '?rel=0" title="YouTube video"\n                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"\n                  style="position:absolute;inset:0;border:0;width:100%;height:100%;"\n                  loading="lazy" allowfullscreen></iframe>\n              </div>'
      );
    }
    if (postId === 381733) {
      const vid4 = '1126193884';
      return (
        '<div class="video-embed" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.15)">\n                <iframe src="https://player.vimeo.com/video/' +
        vid4 +
        '" title="Vimeo video"\n                  allow="autoplay; fullscreen; picture-in-picture"\n                  style="position:absolute;inset:0;border:0;width:100%;height:100%;"\n                  loading="lazy"></iframe>\n              </div>'
      );
    }
    return '';
  }

  function tidyArticleSpacing(container) {
    const blocks = container.querySelectorAll(
      '.wp-block-embed, .wp-block-video, .wp-embed-aspect-16-9, .wp-embed-aspect-4-3'
    );
    blocks.forEach(function (b) {
      if (!b.querySelector('iframe, video')) b.remove();
    });
    while (container.firstElementChild && looksEmpty(container.firstElementChild)) {
      container.firstElementChild.remove();
    }
  }

  function looksEmpty(node) {
    if (!node) return false;
    if (node.querySelector('img,iframe,video,svg,picture')) return false;
    const text = (node.textContent || '').replace(/\u00a0/g, ' ').trim();
    return text.length === 0;
  }

  // Hide an empty post-body container (used only for 381733)
  function collapseIfEmptyBody(bodyEl) {
    if (!bodyEl) return;
    const hasMedia = bodyEl.querySelector('img, iframe, video, svg, picture');
    const text = (bodyEl.textContent || '')
      .replace(/\u00a0/g, ' ')
      .trim();
    if (!hasMedia && !text) {
      bodyEl.style.display = 'none';
    }
  }

  function scrubLeadingEmbedPlaceholders(container, urlCandidate) {
    let changed = false;
    while (container.firstElementChild) {
      const el = container.firstElementChild;
      const cls = (el.className || '') + '';
      const html = el.innerHTML || '';
      const hasIframe = !!el.querySelector('iframe, video');
      const isWpEmbed =
        /\bwp-block-embed\b/.test(cls) ||
        /\bwp-block-video\b/.test(cls) ||
        /\bwp-embed-aspect\b/.test(cls);
      const isVideoLinkPara =
        el.tagName === 'P' &&
        /https?:\/\/(www\.)?(vimeo\.com|youtu\.be|youtube\.com|facebook\.com)\//i.test(
          el.textContent || ''
        ) &&
        !hasIframe;
      const style = el.getAttribute('style') || '';
      const looksLikeRatio =
        /padding-top:\s*(?:56\.25%|75%|62\.5%|[3-8]\d%)/i.test(style) && !hasIframe;
      const matchesDetected =
        urlCandidate &&
        (html.indexOf(urlCandidate) !== -1 ||
          (el.textContent || '').indexOf(urlCandidate) !== -1);
      if (
        isWpEmbed ||
        isVideoLinkPara ||
        looksLikeRatio ||
        matchesDetected
      ) {
        el.remove();
        changed = true;
        continue;
      }
      break;
    }
    if (changed) {
      const fc = container.firstElementChild;
      if (fc) fc.style.marginTop = '0';
    }
  }
})();

/* 🟢 main.js — Hamburger controller v2025-11-12H3 */
(function () {
  function initHamburger() {
    const btn =
      document.querySelector('[data-oo="hamburger"]') ||
      document.querySelector('.oo-hamburger');
    const menu =
      document.querySelector('[data-oo="menu"]') ||
      document.querySelector('.oo-menu');
    const overlay =
      document.querySelector('[data-oo="overlay"]') ||
      document.querySelector('.oo-overlay');

    if (!btn || !menu) {
      console.warn('[OkObserver] hamburger elements missing');
      return;
    }

    const root = document.documentElement;
    const isOpen = function () {
      return root.classList.contains('is-menu-open');
    };

    const openMenu = function () {
      root.classList.add('is-menu-open');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      if (overlay) overlay.hidden = false;
    };

    const closeMenu = function () {
      root.classList.remove('is-menu-open');
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (overlay) overlay.hidden = true;
    };

    const toggleMenu = function (ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      if (isOpen()) closeMenu();
      else openMenu();
    };

    btn.addEventListener('click', toggleMenu);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        toggleMenu(e);
      }
    });

    if (overlay) {
      overlay.addEventListener('click', function (e) {
        e.preventDefault();
        closeMenu();
      });
    }

    document.addEventListener('click', function (e) {
      if (!isOpen()) return;
      if (menu.contains(e.target) || btn.contains(e.target)) return;
      closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        closeMenu();
      }
    });

    window.addEventListener('hashchange', closeMenu);
    window.addEventListener('resize', function () {
      if (isOpen() && window.innerWidth >= 900) {
        closeMenu();
      }
    });

    menu.addEventListener('click', function (e) {
      const a = e.target.closest('a');
      if (a) {
        closeMenu();
      }
    });

    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-expanded', 'false');
    if (!btn.hasAttribute('tabindex')) btn.setAttribute('tabindex', '0');

    console.log('[OkObserver] hamburger ready (single controller)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHamburger, { once: true });
  } else {
    initHamburger();
  }
})();
/* 🔴 main.js — Hamburger controller v2025-11-12H3 */

/* 🟢 main.js — Motto CSS + click-guard (motto not a link) */
(function () {
  function injectCss() {
    const css =
      '\n      .oo-brand,\n      .oo-brand:link,\n      .oo-brand:visited,\n      .oo-brand:hover,\n      .oo-brand:focus,\n      .oo-brand:active {\n        text-decoration: none !important;\n      }\n      .oo-motto {\n        text-decoration: none !important;\n        cursor: default !important;\n      }\n    ';
    const style = document.createElement('style');
    style.setAttribute('data-oo', 'motto-link-kill');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function guardClicks() {
    const brand = document.querySelector('.oo-header-inner .oo-brand');
    if (!brand) return;

    brand.addEventListener(
      'click',
      function (e) {
        const motto = e.target.closest('.oo-motto');
        if (motto) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );
  }

  function init() {
    try {
      injectCss();
      guardClicks();
    } catch (err) {
      console.warn('[OkObserver] motto guard failed:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
/* 🔴 main.js — Motto CSS + click-guard (motto not a link) */

// 🔴 main.js — end of full file
