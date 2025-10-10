import { fetchPost } from "./api.js";

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}

function heroHTML(post) {
  const media = post?._embedded?.["wp:featuredmedia"]?.[0];
  const src = media?.source_url || "";
  if (!src) return "";
  // Contain within rounded frame, not cropped.
  return `<figure style="margin:0 0 18px 0;">
            <img src="${src}" alt="" style="display:block;width:100%;height:auto;border-radius:10px;" />
          </figure>`;
}

export async function renderPost(ctx) {
  const id = ctx?.params?.id;
  const app = document.getElementById("app");

  // Skeleton
  app.innerHTML = `<section class="container">
      <button class="btn back" onclick="location.hash='#/'">← Back to posts</button>
      <div id="detail">Loading…</div>
    </section>`;

  const box = document.getElementById("detail");

  let post;
  try {
    post = await fetchPost(id);
  } catch (e) {
    box.innerHTML = `<h1>Post not found</h1>
      <p>Sorry, we couldn't load this post <strong>${id}</strong>.</p>`;
    return;
  }

  const author = post?._embedded?.author?.[0]?.name || "Oklahoma Observer";
  const title = post?.title?.rendered || "Untitled";

  box.innerHTML = `
    ${heroHTML(post)}
    <h1 style="margin:0 0 8px 0;">${title}</h1>
    <div class="meta" style="margin-bottom:18px;">${author} — ${formatDate(post.date)}</div>
    <div class="content">${post?.content?.rendered || ""}</div>
  `;
}
