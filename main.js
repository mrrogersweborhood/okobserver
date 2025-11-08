/* 🟢 main.js – OkObserver Build 2025-11-07SR1-videoFixR19-entityDecodeForceEmbed */

console.log("[OkObserver] Main JS Build 2025-11-07SR1-videoFixR19-entityDecodeForceEmbed");

// --- Core Init ---
document.addEventListener("DOMContentLoaded", () => {
  console.log("[OkObserver] Initializing core...");

  // Basic router
  const app = document.getElementById("app");
  const route = location.hash.replace("#/", "");
  if (!route) renderHome();
  else if (route.startsWith("post/")) renderPost(route.split("/")[1]);
});

// --- Render Home ---
function renderHome() {
  console.log("[OkObserver] Rendering home...");
  fetch("https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/posts?per_page=20&_embed")
    .then(r => r.json())
    .then(posts => {
      const grid = document.createElement("div");
      grid.className = "post-grid";
      posts
        .filter(p => !p.categories?.includes("cartoon"))
        .forEach(p => {
          const card = document.createElement("article");
          card.className = "post-card";
          card.innerHTML = `
            <img src="${p._embedded?.["wp:featuredmedia"]?.[0]?.source_url || ""}?cb=${p.id}" alt="${p.title.rendered}" class="featured" />
            <h2><a href="#/post/${p.id}">${p.title.rendered}</a></h2>
            <div class="byline"><strong>Oklahoma Observer</strong> — ${new Date(p.date).toLocaleDateString()}</div>
            <div class="excerpt">${p.excerpt.rendered}</div>
          `;
          grid.appendChild(card);
        });
      app.innerHTML = "";
      app.appendChild(grid);
    });
}

// --- Render Post Detail ---
async function renderPost(id) {
  console.log("[OkObserver] Rendering post:", id);
  const res = await fetch(`https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/posts/${id}?_embed`);
  const post = await res.json();
  const body = document.createElement("div");
  body.className = "post-body";

  const featured = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";
  const decoded = decodeHtmlEntities(post.content.rendered);
  body.innerHTML = `
    <h1>${post.title.rendered}</h1>
    <div class="byline"><strong>Oklahoma Observer</strong> — ${new Date(post.date).toLocaleDateString()}</div>
    <img src="${featured}?cb=${post.id}" alt="" class="detail-featured" />
    <article class="post-body">${decoded}</article>
    <button onclick="history.back()" class="back-btn">← Back to Posts</button>
  `;

  app.innerHTML = "";
  app.appendChild(body);

  ensureEmbeddedPlayersVisible(body);
}

// --- Decode HTML Entities ---
function decodeHtmlEntities(str) {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

// --- Ensure Embedded Players Visible ---
function ensureEmbeddedPlayersVisible(root) {
  const iframes = root.querySelectorAll("iframe, .wp-block-embed, .wp-block-embed__wrapper");
  console.log(`[OkObserver] embed scan: ${iframes.length} candidates`);
  if (!iframes.length) tryForceInjectPlayer(root);

  iframes.forEach(f => {
    f.style.display = "block";
    f.style.visibility = "visible";
    f.style.opacity = "1";
    f.style.width = "100%";
    f.style.maxWidth = "100%";
    f.style.minHeight = "480px";
    f.style.background = "black";
    console.log("[OkObserver] ensuring visible embed:", f.src || f.tagName);
  });
}

// --- Try Force Inject Player if Missing ---
function tryForceInjectPlayer(root) {
  const content = root.innerHTML;
  const match = content.match(/https:\/\/(www\.)?(vimeo\.com|youtu\.be|youtube\.com|facebook\.com)\/[^\s"<]+/i);
  if (!match) {
    console.warn("[OkObserver] no video URL found to inject");
    return;
  }

  const url = match[0];
  console.log("[OkObserver] force injecting player from:", url);

  let src = "";
  if (/vimeo\.com/i.test(url)) {
    const id = url.match(/vimeo\.com\/(\d+)/i)?.[1];
    src = `https://player.vimeo.com/video/${id}`;
  } else if (/youtu\.?be/i.test(url)) {
    const id = url.match(/(?:v=|youtu\.be\/)([\w-]+)/i)?.[1];
    src = `https://www.youtube.com/embed/${id}`;
  } else if (/facebook\.com/i.test(url)) {
    src = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
  }

  if (!src) {
    console.warn("[OkObserver] could not derive embed src from:", url);
    return;
  }

  const ifr = document.createElement("iframe");
  ifr.src = src;
  ifr.allow = "autoplay; encrypted-media; picture-in-picture";
  ifr.allowFullscreen = true;
  Object.assign(ifr.style, {
    display: "block",
    visibility: "visible",
    width: "100%",
    minHeight: "480px",
    border: "0",
    margin: "0 auto 16px",
    background: "black"
  });

  const firstP = root.querySelector("p");
  (firstP || root).insertAdjacentElement("afterend", ifr);
  console.log("[OkObserver] player injected successfully:", src);
}

/* 🔴 main.js */
