// home.v263.js  — resilient list page with 4-col grid, filtering, and infinite scroll

export default async function renderHome(app) {
  // ---------- 1) Resolve API base robustly ----------
  const apiBase =
    (typeof window !== 'undefined' && window.OKO_API_BASE) ||
    (document.querySelector('meta[name="oko-api-base"]')?.content) ||
    '';

  if (!apiBase) {
    console.error('[Home] API base missing.');
    app.innerHTML = `
      <section class="page-error" style="max-width:1200px;margin:3rem auto;padding:1rem;">
        <p><strong>Page error:</strong> API base missing.</p>
      </section>
    `;
    return;
  }

  // ---------- 2) Utilities ----------
  const fetchJSON = async (url) => {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const isCartoon = (post) => {
    // Check categories and tags (embedded) for “cartoon”
    const cats = post._embedded?.['wp:term']?.[0] || [];
    const tags = post._embedded?.['wp:term']?.[1] || [];
    const hasKey = (arr) =>
      arr?.some((t) =>
        String(t?.name || t?.slug || '')
          .toLowerCase()
          .includes('cartoon')
      );
    return hasKey(cats) || hasKey(tags);
  };

  // ---------- 3) Styles (scoped-ish) ----------
  const styleId = 'oko-home-inline-style';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      .oko-wrap{max-width:1200px;margin:1.5rem auto;padding:0 1rem;}
      .oko-grid{display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:18px;}
      @media (min-width:640px){.oko-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
      @media (min-width:1024px){.oko-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}
      @media (min-width:1280px){.oko-grid{grid-template-columns:repeat(4,minmax(0,1fr));}}
      .oko-card{background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:hidden;border:1px solid rgba(0,0,0,.06);display:flex;flex-direction:column}
      .oko-thumb{display:block;overflow:hidden;background:#f3f4f6}
      .oko-thumb img{display:block;width:100%;height:auto;transition:transform .2s ease}
      .oko-thumb:hover img{transform:scale(1.02)}
      .oko-body{padding:12px 14px 14px}
      .oko-title{font-weight:700;line-height:1.25;margin:0 0 .35rem 0}
      .oko-title a{color:#1e63ff;text-decoration:none}
      .oko-title a:hover{text-decoration:underline}
      .oko-meta{font-size:.9rem;color:#6b7280;margin-bottom:.5rem}
      .oko-excerpt{color:#222;line-height:1.55;font-size:.98rem}
      .oko-sentinel{height:1px}
      .oko-empty{color:#555;margin:2rem 0}
    `;
    document.head.appendChild(s);
  }

  // ---------- 4) Shell ----------
  app.innerHTML = `
    <section class="oko-wrap">
      <h2 style="font-size:1.75rem;margin:0 0 .75rem 0">Latest Posts</h2>
      <div id="okoGrid" class="oko-grid" role="list"></div>
      <div id="okoStatus" class="oko-empty" aria-live="polite"></div>
      <div id="okoSentinel" class="oko-sentinel"></div>
    </section>
  `;
  const $grid = app.querySelector('#okoGrid');
  const $status = app.querySelector('#okoStatus');
  const $sentinel = app.querySelector('#okoSentinel');

  // ---------- 5) Paging / state ----------
  let page = 1;
  const perPage = 18; // initial batch
  let fetching = false;
  let done = false;

  const buildCard = (post) => {
    const id = post.id;
    const title = post.title?.rendered || 'Untitled';
    const date = post.date ? fmtDate(post.date) : '';
    const author =
      post._embedded?.author?.[0]?.name ||
      post._embedded?.author?.[0]?.slug ||
      '—';
    const media = post._embedded?.['wp:featuredmedia']?.[0];
    const src =
      media?.media_details?.sizes?.medium_large?.source_url ||
      media?.media_details?.sizes?.large?.source_url ||
      media?.source_url ||
      '';
    const excerpt = (post.excerpt?.rendered || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return `
      <article class="oko-card" role="listitem">
        <a class="oko-thumb" href="#/post/${id}" aria-label="Open: ${title.replace(/"/g,'&quot;')}">
          ${
            src
              ? `<img loading="lazy" src="${src}" alt="" />`
              : `<div style="padding-top:56.25%;background:#e5e7eb"></div>`
          }
        </a>
        <div class="oko-body">
          <h3 class="oko-title"><a href="#/post/${id}">${title}</a></h3>
          <div class="oko-meta">By ${author} • ${date}</div>
          <p class="oko-excerpt">${excerpt}</p>
        </div>
      </article>
    `;
  };

  const loadPage = async () => {
    if (fetching || done) return;
    fetching = true;
    $status.textContent = 'Loading…';

    let posts = [];
    try {
      posts = await fetchJSON(
        `${apiBase}/wp-json/wp/v2/posts?status=publish&_embed=1&per_page=${perPage}&page=${page}`
      );
    } catch (err) {
      // 400/404 when page exceeds max -> treat as done
      if (err.message?.includes('HTTP 4')) {
        done = true;
        $status.textContent = 'All caught up.';
        fetching = false;
        return;
      }
      console.error('[Home] fetch error:', err);
      $status.textContent = 'Failed to fetch posts.';
      fetching = false;
      return;
    }

    // Filter cartoons
    const visible = posts.filter((p) => !isCartoon(p));

    if (!visible.length) {
      // If the whole page filtered out, try the next page once
      if (posts.length > 0) {
        page += 1;
        fetching = false;
        return loadPage();
      }
      done = true;
      $status.textContent = 'All caught up.';
      fetching = false;
      return;
    }

    const html = visible.map(buildCard).join('');
    $grid.insertAdjacentHTML('beforeend', html);

    // If fewer than requested, we’re done
    if (posts.length < perPage) {
      done = true;
      $status.textContent = 'All caught up.';
    } else {
      $status.textContent = '';
      page += 1;
    }
    fetching = false;
  };

  // ---------- 6) Infinite scroll ----------
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !fetching && !done) {
          loadPage();
        }
      });
    },
    { rootMargin: '800px 0px 800px 0px' }
  );
  io.observe($sentinel);

  // ---------- 7) Initial load ----------
  loadPage();
}
