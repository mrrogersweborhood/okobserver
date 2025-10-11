export async function renderPost(container, id) {
  const host = container || document.getElementById("app");
  if (!host) {
    console.error("[OkObserver] post container not found");
    return;
  }

  host.innerHTML = `<div class="spinner"></div><p>Loading post...</p>`;

  try {
    const API_BASE = (window && (window.API_BASE || window.OKO_API_BASE)) || "api/wp/v2";
    const res = await fetch(`${API_BASE}/posts/${id}?_embed=1`);
    const post = await res.json();

    const title = post.title?.rendered || "Untitled";
    const content = post.content?.rendered || "";
    const author = post._embedded?.author?.[0]?.name || "Oklahoma Observer";
    const date = new Date(post.date).toLocaleDateString();

    host.innerHTML = `
      <article class="post-detail">
        <h1>${title}</h1>
        <p class="meta">By ${author} • ${date}</p>
        <div class="content">${content}</div>
      </article>
    `;
  } catch (err) {
    console.error("[OkObserver] post load failed:", err);
    host.innerHTML = `<p>Unable to load post.</p>`;
  }
}

export default renderPost;
