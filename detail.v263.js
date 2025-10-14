// detail.v263.js  (robust against missing window.OKO_API_BASE)
// Renders a single post page with video/featured image, author/date,
// and back-to-posts links at top and bottom.

export default async function renderDetail(app, id) {
  // ---------- 1) Resolve API base robustly ----------
  const apiBase =
    (typeof window !== 'undefined' && window.OKO_API_BASE) ||
    (document.querySelector('meta[name="oko-api-base"]')?.content) ||
    '';

  if (!apiBase) {
    // make the failure visible but controlled
    console.error('[Detail] API base missing.');
    app.innerHTML = `
      <section class="page-error" style="max-width:960px;margin:3rem auto;padding:1rem;">
        <p><strong>Page error:</strong> API base missing.</p>
      </section>
    `;
    return; // do not throw; render a friendly message instead
  }

  // ---------- 2) Helpers ----------
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

  const backLink = `<a href="#/posts" class="back-link" style="text-decoration:none;">← Back to Posts</a>`;

  // ---------- 3) Fetch post (with _embed for author & media) ----------
  let post;
  try {
    post = await fetchJSON(
      `${apiBase}/wp-json/wp/v2/posts/${encodeURIComponent(id)}?_embed=1`
    );
  } catch (err) {
    app.innerHTML = `
      <section class="page-error" style="max-width:960px;margin:3rem auto;padding:1rem;">
        <p><strong>Page error:</strong> Failed to load post ${id}. ${err?.message || err}</p>
      </section>
    `;
    return;
  }

  // ---------- 4) Extract bits ----------
  const title = post.title?.rendered || 'Untitled';
  const date = post.date ? fmtDate(post.date) : '';
  const author =
    post._embedded?.author?.[0]?.name ||
    post._embedded?.author?.[0]?.slug ||
    '—';

  // Featured media (image) if present
  const media = post._embedded?.['wp:featuredmedia']?.[0];
  const featuredSrc =
    media?.media_details?.sizes?.large?.source_url ||
    media?.media_details?.sizes?.medium_large?.source_url ||
    media?.source_url ||
    '';

  // Try to detect a Vimeo/YT link inside the content to show a playable embed
  const contentHTML = post.content?.rendered || '';
  const vimeoMatch = contentHTML.match(
    /https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/
  );
  const youTubeMatch = contentHTML.match(
    /https?:\/\/(?:www\.)?youtu(?:\.be|be\.com)\/(?:watch\?v=)?([A-Za-z0-9_-]{6,})/
  );

  const videoEmbed = (() => {
    if (vimeoMatch) {
      const id = vimeoMatch[1];
      return `
        <div class="video-wrap" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000;">
          <iframe
            src="https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0"
            style="position:absolute;inset:0;border:0;width:100%;height:100%;"
            allow="autoplay; fullscreen; picture-in-picture"
            allowfullscreen
          ></iframe>
        </div>`;
    }
    if (youTubeMatch) {
      const id = youTubeMatch[1];
      return `
        <div class="video-wrap" style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000;">
          <iframe
            src="https://www.youtube.com/embed/${id}"
            style="position:absolute;inset:0;border:0;width:100%;height:100%;"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>
        </div>`;
    }
    return '';
  })();

  // ---------- 5) Render ----------
  app.innerHTML = `
    <section class="post-detail" style="max-width:960px;margin:2rem auto; padding:0 1rem;">
      <div style="margin-bottom:1rem">${backLink}</div>

      <header style="margin-bottom:1rem;">
        <h1 style="margin:0 0 .5rem 0; line-height:1.2;">${title}</h1>
        <div style="color:#555;font-size:.95rem;">By ${author} — ${date}</div>
      </header>

      ${
        videoEmbed
          ? `<figure style="margin:1rem 0 2rem 0;">${videoEmbed}</figure>`
          : featuredSrc
          ? `<figure style="margin:1rem 0 2rem 0;">
               <img src="${featuredSrc}" alt="" style="max-width:100%;height:auto;border-radius:12px;display:block;margin:0 auto;" />
             </figure>`
          : ''
      }

      <article class="entry-content" style="line-height:1.7; color:#222;">
        ${contentHTML}
      </article>

      <div style="margin:2rem 0 1rem 0">${backLink}</div>
    </section>
  `;

  // ---------- 6) Small content cleanups ----------
  // Remove stray “Screenshot” placeholders that sometimes appear after embeds.
  app.querySelectorAll('.entry-content p').forEach((p) => {
    if (/^\s*screenshot\s*$/i.test(p.textContent.trim())) {
      p.remove();
    }
  });

  // Ensure first paragraph isn’t indented oddly
  const firstP = app.querySelector('.entry-content p');
  if (firstP) firstP.style.textIndent = '0';
}
