// about.js — OkObserver simple About page
// v2.5.4
export function renderAbout() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <article class="post" style="max-width:800px;margin:0 auto;background:#fff;border-radius:10px;padding:1.5rem 2rem;box-shadow:0 1px 2px rgba(0,0,0,.05)">
      <h1 class="post-title" style="text-align:center;color:#1E90FF;margin-top:0">About</h1>
      <div class="post-content">
        <p><strong>The Oklahoma Observer</strong> is dedicated to vigorous, independent journalism — to comfort the afflicted and afflict the comfortable.</p>
        <p>Visit <a href="https://okobserver.org" target="_blank" rel="noopener">okobserver.org</a> to learn more.</p>
      </div>
      <div style="text-align:center;margin-top:2rem;">
        <a class="back-btn" href="#/" style="background:#1E90FF;color:#fff;border:none;padding:.6rem 1.2rem;border-radius:8px;text-decoration:none;display:inline-block">← Back to posts</a>
      </div>
    </article>
  `;
}
