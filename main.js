/* 🟢 main.js — Full replacement. Build 2025-11-08-gridFix3-cartoonCatOnly1
   Changes:
   - Cartoon filter now checks ONLY WordPress CATEGORIES via _embedded['wp:term'][0] (the categories array).
   - Tags are ignored.
   - All other behavior unchanged.
*/

(function(){
  const BUILD = '2025-11-08-gridFix3-cartoonCatOnly1';
  console.log('[OkObserver] Main JS Build', BUILD);

  // ---- Config --------------------------------------------------------------
  const API = 'https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2';
  const PER_PAGE = 12;

  const qs = (s, el=document)=> el.querySelector(s);
  const qsa = (s, el=document)=> Array.from(el.querySelectorAll(s));
  const el = (tag, cls, html)=> {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html!=null) n.innerHTML = html;
    return n;
  };

  // ---- Router --------------------------------------------------------------
  window.addEventListener('hashchange', route);
  window.addEventListener('load', route);

  function route(){
    const hash = location.hash || '#/';
    if (hash.startsWith('#/post/')) {
      const id = parseInt(hash.split('/').pop(), 10);
      renderPost(id);
    } else if (hash.startsWith('#/about')) {
      renderAbout();
    } else {
      renderHome();
    }
  }

  // ---- Cartoon filter (CATEGORIES ONLY) ------------------------------------
  function isCartoonCategory(term){
    if (!term) return false;
    const name = String(term.name || '').toLowerCase();
    const slug = String(term.slug || '').toLowerCase();
    if (slug === 'cartoon' || slug === 'cartoons') return true;
    if (name.includes('cartoon')) return true;
    return false;
  }

  function postIsCartoonByCategory(post){
    // WordPress embeds categories at _embedded['wp:term'][0]
    const catArray = post?._embedded?.['wp:term']?.[0];
    if (Array.isArray(catArray) && catArray.some(isCartoonCategory)) return true;

    // If we didn't get embeds, we do NOT exclude to avoid false positives.
    // (We already request _embed in our fetch below.)
    return false;
  }

  // ---- Fetch helpers -------------------------------------------------------
  async function wp(path, params={}){
    const url = new URL(API + path);
    Object.entries(params).forEach(([k,v])=> url.searchParams.set(k, v));
    const res = await fetch(url.toString(), {mode:'cors'});
    if (!res.ok) throw new Error('API error ' + res.status);
    return res.json();
  }

  // ---- Views ---------------------------------------------------------------
  async function renderHome(){
    const root = qs('#app');
    root.innerHTML = '';
    const grid = el('section','posts-grid');
    root.appendChild(grid);

    let page = 1;
    let loading = false;
    let done = false;

    async function load(){
      if (loading || done) return;
      loading = true;
      try {
        const posts = await wp('/posts', {
          per_page: PER_PAGE,
          page,
          _embed: '1',
          order: 'desc',
          orderby: 'date'
        });

        // Filter out cartoons by CATEGORY ONLY
        const filtered = posts.filter(p => !postIsCartoonByCategory(p));

        let placed = 0;
        for (const p of filtered) {
          grid.appendChild(postCard(p));
          placed++;
        }

        if (posts.length < PER_PAGE) done = true;
        page++;

        // Safety: enforce grid display
        grid.style.display = 'grid';
      } catch(e){
        console.error(e);
        done = true;
      } finally {
        loading = false;
      }
    }

    // Initial load + infinite scroll
    await load();
    const io = new IntersectionObserver((entries)=>{
      if (entries.some(e => e.isIntersecting)) load();
    }, {rootMargin: '1200px'});
    const sentinel = el('div','', '');
    sentinel.setAttribute('aria-hidden','true');
    root.appendChild(sentinel);
    io.observe(sentinel);
  }

  function postCard(p){
    const card = el('article','post-card');
    const link = '#/post/' + p.id;

    // Featured image
    let imgHtml = '';
    const media = p._embedded?.['wp:featuredmedia']?.[0];
    const src = media && (media.source_url || media?.media_details?.sizes?.medium_large?.source_url || media?.media_details?.sizes?.full?.source_url);
    if (src) imgHtml = `<img class="post-thumb" src="${src}?cb=${p.id}" alt="">`;

    // Byline/date
    const author = p._embedded?.author?.[0]?.name || 'Oklahoma Observer';
    const date = new Date(p.date_gmt || p.date).toLocaleDateString(undefined, {month:'numeric',day:'numeric',year:'numeric'});

    card.innerHTML = `
      <a class="post-link" href="${link}" aria-label="${escapeHtml(stripTags(p.title?.rendered || ''))}">
        ${imgHtml}
        <h2 class="post-title">${p.title?.rendered || ''}</h2>
      </a>
      <div class="post-meta"><strong>${author}</strong> — ${date}</div>
      <div class="post-excerpt">${p.excerpt?.rendered || ''}</div>
    `;
    return card;
  }

  async function renderPost(id){
    const root = qs('#app');
    root.innerHTML = '';
    try{
      const post = await wp('/posts/' + id, {_embed:'1'});
      const wrap = el('article','post-body');

      const author = post._embedded?.author?.[0]?.name || 'Oklahoma Observer';
      const date = new Date(post.date_gmt || post.date).toLocaleDateString(undefined, {month:'short',day:'numeric',year:'numeric'});

      let hero = '';
      const media = post._embedded?.['wp:featuredmedia']?.[0];
      const src = media && (media.source_url || media?.media_details?.sizes?.full?.source_url);
      if (src) hero = `<figure class="post-hero"><img src="${src}?cb=${post.id}" alt=""></figure>`;

      wrap.innerHTML = `
        ${hero}
        <h1 class="post-title">${post.title?.rendered || ''}</h1>
        <div class="post-byline"><strong>${author}</strong> — ${date}</div>
        <div class="post-content">${post.content?.rendered || ''}</div>
        <p><a class="back-btn" href="#/">← Back to Posts</a></p>
      `;
      root.appendChild(wrap);

      ensureEmbedsVisible();
    }catch(e){
      console.error(e);
      root.textContent = 'Post failed to load.';
    }
  }

  function renderAbout(){
    const root = qs('#app');
    root.innerHTML = `
      <section class="about">
        <h1>About The Oklahoma Observer</h1>
        <p>The Oklahoma Observer covers government, politics, social issues, education, health and welfare, and civil liberties.</p>
      </section>
    `;
  }

  // ---- Video/embed visibility helper --------------------------------------
  function ensureEmbedsVisible(){
    const style = document.createElement('style');
    style.textContent = `
      iframe, video, .wp-block-embed__wrapper, .wp-block-embed, .fb-video, .fb-post {
        display:block !important; visibility:visible !important; opacity:1 !important;
        width:100% !important; max-width:100% !important; min-height:360px !important; height:auto !important;
        background:#0000 !important;
      }
      div[data-oembed-url]{ display:block !important; visibility:visible !important; min-height:360px !important; }
      .post-hero img{ width:100%; height:auto; display:block; object-fit:contain; }
    `;
    document.head.appendChild(style);
  }

  // ---- Utilities -----------------------------------------------------------
  function stripTags(html){ return (html||'').replace(/<[^>]*>/g,''); }
  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

})();
 /* 🔴 main.js */
