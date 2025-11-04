/* =========================================================================
   OkObserver main.js — Build 2025-11-03 R1an + Snapshot Restore v2025-11-04a
   Plain JS (no ESM). Preserves grid enforcer & design/behavior rules.
   ========================================================================= */

(function () {
  'use strict';

  // ------------------------------
  // Version & constants
  // ------------------------------
  const BUILD = '2025-11-03R1an+SR-2025-11-04a';
  const API_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PER_PAGE = 12;
  const ORDER_QS = '&orderby=date&order=desc';
  const VQ = `?v=${BUILD}`;

  // SessionStorage keys (keep stable names)
  const SS = {
    FEED_IDS: 'okob.feed.ids',
    FEED_BYID: 'okob.feed.byid',
    FEED_PAGE: 'okob.feed.page',
    FEED_END:  'okob.feed.end',
    SCROLL_Y:  'okob.scrollY',
    ACTIVE_ID: 'okob.activeId',
    ACTIVE_PATH: 'okob.activePath',
    RETURN_TOKEN: 'okob.returnToken'
  };

  // ------------------------------
  // In-memory app state
  // ------------------------------
  let route = 'home';
  let page = 1;
  let loading = false;
  let reachedEnd = false;

  // Canonical feed snapshot we control
  const feedIds = [];
  const feedById = Object.create(null);
  const seenIds = new Set();

  // ------------------------------
  // DOM hooks
  // ------------------------------
  const $   = (s, r = document) => r.querySelector(s);
  const $$  = (s, r = document) => Array.from(r.querySelectorAll(s));

  const appRoot   = $('#app') || document.body;
  const gridEl    = $('#post-grid');
  const versionEl = $('#build-version');

  if (versionEl) versionEl.textContent = `Build ${BUILD}`;

  // ------------------------------
  // Snapshot helpers (store ordered IDs + slim byId + page + end + scrollY)
  // ------------------------------
  function saveFeedSnapshotData({ ids, byId, nextPage, reachedEnd: endFlag }) {
    try {
      sessionStorage.setItem(SS.FEED_IDS, JSON.stringify(ids || []));
      const slim = {};
      (ids || []).forEach(id => {
        const p = byId[id];
        if (!p) return;
        slim[id] = {
          id: p.id,
          date: p.date,
          title: p.title,
          excerpt: p.excerpt,
          author_name: p.author_name,
          categories: p.categories,
          featured_media: p.featured_media || null,
          featured_src: p.featured_src || null,
          _embedded: p._embedded || null,
          content: p.content || null
        };
      });
      sessionStorage.setItem(SS.FEED_BYID, JSON.stringify(slim));
      sessionStorage.setItem(SS.FEED_PAGE, String(nextPage || 1));
      sessionStorage.setItem(SS.FEED_END, String(!!endFlag));
      sessionStorage.setItem(SS.SCROLL_Y, String(window.scrollY || 0));
    } catch (e) {
      console.warn('[OkObserver] snapshot save failed', e);
    }
  }

  function readFeedSnapshotData() {
    try {
      const ids = JSON.parse(sessionStorage.getItem(SS.FEED_IDS) || '[]');
      const byId = JSON.parse(sessionStorage.getItem(SS.FEED_BYID) || '{}');
      if (!Array.isArray(ids) || !ids.length) return null;
      return { ids, byId };
    } catch {
      return null;
    }
  }

  function clearFeedSnapshotData() {
    try {
      sessionStorage.removeItem(SS.FEED_IDS);
      sessionStorage.removeItem(SS.FEED_BYID);
      sessionStorage.removeItem(SS.FEED_PAGE);
      sessionStorage.removeItem(SS.FEED_END);
      sessionStorage.removeItem(SS.SCROLL_Y);
    } catch {}
  }

  // Clear snapshot only on true hard reload, not back/forward
  window.addEventListener('pageshow', () => {
    if (performance?.navigation?.type === 1) {
      clearFeedSnapshotData();
    }
  });

  // ------------------------------
  // Filters / normalization
  // ------------------------------
  function isCartoon(post) {
    const cats = (post._embedded?.['wp:term'] || [])
      .flat()
      .map(t => (t?.slug || t?.name || '').toString().toLowerCase());
    return cats.includes('cartoon');
  }

  function normalizePost(p) {
    const id = p.id;
    const title = (p.title?.rendered || '').trim();
    const excerpt = (p.excerpt?.rendered || '').trim();
    const content = (p.content?.rendered || '').trim();
    const date = p.date;
    const author_name = p._embedded?.author?.[0]?.name || 'Oklahoma Observer';

    // Featured image
    let featured_src = null;
    if (p._embedded?.['wp:featuredmedia']?.[0]?.media_details?.sizes) {
      const sizes = p._embedded['wp:featuredmedia'][0].media_details.sizes;
      const best = sizes.large || sizes.medium_large || sizes.medium || sizes.full;
      featured_src = best?.source_url || null;
    } else if (p._embedded?.['wp:featuredmedia']?.[0]?.source_url) {
      featured_src = p._embedded['wp:featuredmedia'][0].source_url;
    }
    if (featured_src) {
      const sep = featured_src.includes('?') ? '&' : '?';
      featured_src = `${featured_src}${sep}cb=${id}`;
    }

    return {
      id, date, title, excerpt, content,
      link: `#/post/${id}`,
      author_name,
      categories: p.categories || [],
      featured_media: p.featured_media || null,
      featured_src,
      _embedded: p._embedded || null
    };
  }

  // ------------------------------
  // Rendering
  // ------------------------------
  function clearGrid() {
    if (gridEl) gridEl.innerHTML = '';
  }

  function cardHTML(p) {
    return `
      <article class="post-card" data-id="${p.id}" tabindex="0">
        ${p.featured_src ? `<div class="post-card-image"><img src="${p.featured_src}" alt="" loading="lazy"></div>` : ``}
        <div class="post-card-body">
          <h3 class="post-card-title"><a href="${p.link}">${p.title}</a></h3>
          <div class="post-card-byline"><strong>${p.author_name}</strong> · ${new Date(p.date).toLocaleDateString()}</div>
          <div class="post-card-excerpt">${p.excerpt}</div>
        </div>
      </article>
    `;
  }

  function mountGrid(posts) {
    if (!gridEl) return;
    gridEl.innerHTML = posts.map(cardHTML).join('');
    wireCardClicks();
  }

  function mountGridAppend(posts) {
    if (!gridEl || !posts.length) return;
    const frag = document.createDocumentFragment();
    posts.forEach(p => {
      // maintain canonical feed structures
      if (!seenIds.has(p.id)) {
        feedIds.push(p.id);
        feedById[p.id] = p;
        seenIds.add(p.id);
      }
      const wrapper = document.createElement('div');
      wrapper.innerHTML = cardHTML(p);
      frag.appendChild(wrapper.firstElementChild);
    });
    gridEl.appendChild(frag);
    wireCardClicks();
  }

  function wireCardClicks() {
    $$('.post-card a').forEach(a => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const href = ev.currentTarget.getAttribute('href') || '';
        const id = href.split('/').pop();
        // snapshot exact feed + scroll before routing
        saveFeedSnapshotData({
          ids: feedIds,
          byId: feedById,
          nextPage: page,
          reachedEnd
        });
        sessionStorage.setItem(SS.ACTIVE_ID, String(id));
        sessionStorage.setItem(SS.ACTIVE_PATH, href);
        sessionStorage.setItem(SS.RETURN_TOKEN, String(Date.now()));
        navigateTo(href);
      }, { passive: false });
    });
  }

  // ------------------------------
  // Networking
  // ------------------------------
  async function fetchPage(pageNum) {
    const url = `${API_BASE}/posts?per_page=${PER_PAGE}&page=${pageNum}${ORDER_QS}&_embed=1`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) return [];
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }

  // Fill-until-enough loader
  async function loadNext() {
    if (loading || reachedEnd) return;
    loading = true;

    let appended = 0;
    const target = PER_PAGE;
    let guard = 8;

    while (appended < target && guard-- > 0) {
      const raw = await fetchPage(page);
      if (!raw.length) {
        reachedEnd = true;
        break;
      }
      const keep = raw.filter(p => !isCartoon(p));
      const normalized = keep.map(normalizePost);

      mountGridAppend(normalized);

      appended += normalized.length;
      page += 1;
    }

    // Persist exact snapshot after each cycle
    saveFeedSnapshotData({
      ids: feedIds,
      byId: feedById,
      nextPage: page,
      reachedEnd
    });

    loading = false;
  }

  // ------------------------------
  // Infinite scroll sentinel/watchdog
  // ------------------------------
  let sentinel = $('#infinite-sentinel');
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.id = 'infinite-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.height = '1px';
    appRoot.appendChild(sentinel);
  }

  let io;
  function attachObserver() {
    if (io) io.disconnect();
    io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadNext();
    }, { rootMargin: '800px 0px 800px 0px' });
    io.observe(sentinel);
  }

  function detachObserver() {
    if (io) io.disconnect();
  }

  // ------------------------------
  // Router
  // ------------------------------
  function parseRoute() {
    const h = location.hash || '#/';
    if (h.startsWith('#/post/')) return { name: 'post', id: h.split('/').pop() };
    return { name: 'home' };
  }

  // Home: try restore before any fetch
  async function renderHome() {
    detachObserver();

    const snap = readFeedSnapshotData();
    if (snap) {
      const list = snap.ids.map(id => snap.byId[id]).filter(Boolean);
      // Sync in-memory sets so we don’t duplicate later
      feedIds.length = 0;
      list.forEach(p => {
        feedIds.push(p.id);
        feedById[p.id] = p;
        seenIds.add(p.id);
      });

      mountGrid(list);

      page = Math.max(1, Number(sessionStorage.getItem(SS.FEED_PAGE) || '1'));
      reachedEnd = sessionStorage.getItem(SS.FEED_END) === 'true';
      loading = false;

      // scroll restore
      const y = Number(sessionStorage.getItem(SS.SCROLL_Y) || '0');
      requestAnimationFrame(() => window.scrollTo(0, y));

      attachObserver(); // resume infinite scroll
      return;
    }

    // Cold load
    clearGrid();
    feedIds.length = 0;
    for (const k in feedById) delete feedById[k];
    seenIds.clear();
    page = 1; reachedEnd = false; loading = false;

    await loadNext();
    attachObserver();
  }

  async function renderDetail(id) {
    detachObserver();
    clearGrid();

    const holder = document.createElement('div');
    holder.id = 'post-detail';
    gridEl.appendChild(holder);

    let post = feedById[id];
    if (!post) {
      const res = await fetch(`${API_BASE}/posts/${id}?_embed=1`);
      if (res.ok) post = normalizePost(await res.json());
    }

    if (!post) {
      holder.innerHTML = `<p>Post not found.</p><p><a class="back-to-posts" href="#/">Back to Posts</a></p>`;
      wireBack(holder);
      return;
    }

    holder.innerHTML = `
      <article class="post-detail">
        ${post.featured_src ? `<div class="detail-hero"><img src="${post.featured_src}" alt=""></div>` : ``}
        <h1 class="detail-title">${post.title}</h1>
        <div class="detail-byline"><strong>${post.author_name}</strong> · ${new Date(post.date).toLocaleDateString()}</div>
        <div class="detail-content">${post.content || ''}</div>
        <p class="back-wrap"><a class="back-to-posts" href="#/">Back to Posts</a></p>
      </article>
    `;
    wireBack(holder);
  }

  function wireBack(scope) {
    const back = scope.querySelector('.back-to-posts');
    if (back) {
      back.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('#/'); // Home will restore from snapshot
      });
    }
  }

  async function router() {
    const r = parseRoute();
    route = r.name;
    if (r.name === 'post') {
      await renderDetail(r.id);
    } else {
      await renderHome();
    }
  }

  function navigateTo(hash) {
    if (location.hash === hash) router();
    else location.hash = hash;
  }

  // keyboard open (Enter/Space)
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.classList.contains('post-card')) {
      const id = document.activeElement.getAttribute('data-id');
      if (id) {
        saveFeedSnapshotData({
          ids: feedIds,
          byId: feedById,
          nextPage: page,
          reachedEnd
        });
        navigateTo(`#/post/${id}`);
      }
    }
  });

  window.addEventListener('hashchange', router);
  window.addEventListener('DOMContentLoaded', router);

  console.log(`[OkObserver] main.js loaded: ${BUILD}`);
})();
