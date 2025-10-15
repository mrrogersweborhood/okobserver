/* detail.v263.js – detail page with Facebook-video handling */
export async function renderPostDetail(id, ctx) {
  const { apiFetchJson, CONFIG } = ctx;

  const shell = document.createElement("div");
  shell.className = "card detail";

  // Back button row w/ margin
  const back = document.createElement("div");
  back.className = "back-row";
  back.innerHTML = `<a class="btn" href="#/"><span>←</span> Back to Posts</a>`;
  shell.appendChild(back);

  // Load post (with embed for author + featured image)
  let post;
  try {
    const url = `${CONFIG.API_BASE}/posts/${id}?_embed=1`;
    post = await apiFetchJson(url);
  } catch (err) {
    console.error("[Detail] failed to fetch post:", err);
    const d = document.createElement("div");
    d.style.padding = "18px";
    d.textContent = "Page error: could not load post.";
    shell.appendChild(d);
    return shell;
  }

  // Featured image
  const media =
    post._embedded?.["wp:featuredmedia"]?.[0] || null;
  const heroSrc =
    media?.media_details?.sizes?.large?.source_url ||
    media?.source_url ||
    "";

  if (heroSrc) {
    const hero = document.createElement("img");
    hero.className = "detail-hero";
    hero.src = heroSrc;
    hero.alt = media?.alt_text || (post.title?.rendered?.replace(/<[^>]+>/g, "") ?? "Featured");
    hero.style.margin = "0 16px";
    shell.appendChild(hero);
  }

  // Title (explicitly no background)
  const head = document.createElement("div");
  head.className = "detail-head";
  const h1 = document.createElement("h1");
  h1.className = "detail-title";
  h1.innerHTML = post.title?.rendered || "Untitled";
  head.appendChild(h1);

  // Author + date
  const meta = document.createElement("p");
  meta.className = "detail-meta";
  const author =
    post._embedded?.author?.[0]?.name || post._embedded?.author?.[0]?.slug || "Oklahoma Observer";
  const date = new Date(post.date).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  meta.textContent = `By ${author} — ${date}`;
  head.appendChild(meta);
  shell.appendChild(head);

  const content = document.createElement("div");
  content.className = "detail-content";

  // If body contains a Facebook post/video link, embed it using FB plugin
  const bodyHTML = post.content?.rendered || "";
  const fbMatch = bodyHTML.match(
    /(https?:\/\/www\.facebook\.com\/[^\s"'<)]+)/
  );
  if (fbMatch) {
    const fbUrl = encodeURIComponent(fbMatch[1]);
    const iframe = document.createElement("div");
    iframe.className = "video-embed";
    iframe.innerHTML = `
      <iframe
        src="https://www.facebook.com/plugins/post.php?href=${fbUrl}&show_text=true&width=700"
        width="700" height="500" style="border:none;overflow:hidden"
        scrolling="no" frameborder="0" allowfullscreen="true"
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share">
      </iframe>`;
    content.appendChild(iframe);
  }

  // Insert the rest of the content below (with images responsive)
  const body = document.createElement("div");
  body.innerHTML = bodyHTML;
  // make images responsive
  body.querySelectorAll("img").forEach((img) => {
    img.removeAttribute("width");
    img.removeAttribute("height");
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    img.style.borderRadius = "10px";
  });
  content.appendChild(body);

  // bottom back button
  const backBottom = document.createElement("div");
  backBottom.style.padding = "8px 16px 18px";
  backBottom.innerHTML = `<a class="btn" href="#/"><span>←</span> Back to Posts</a>`;

  shell.append(content, backBottom);
  return shell;
}
