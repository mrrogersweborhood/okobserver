// about.js — static About/Contact/Donate page (no API imports)

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v, { passive: true });
    } else if (v !== false && v != null) {
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === "string") el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}

// Minimal, clean, responsive HTML (no blank lines, images don’t cover text)
const ABOUT_HTML = `
  <section class="about">
    <h1>The Oklahoma Observer — About / Contact / Donate</h1>
    <p>The Oklahoma Observer has chronicled state politics, policy, and culture since 1968. This is an unofficial, read-only demo client.</p>

    <h2>Contact</h2>
    <p><strong>Website:</strong> <a href="https://okobserver.org/contact-about-donate/" target="_blank" rel="noopener">okobserver.org/contact-about-donate/</a></p>
    <p><strong>Email:</strong> <a href="mailto:info@okobserver.org">info@okobserver.org</a></p>

    <h2>Subscribe / Donate</h2>
    <p>Support independent Oklahoma journalism. Visit the official site for subscription options and donations.</p>
    <p><a class="btn" href="https://okobserver.org/contact-about-donate/" target="_blank" rel="noopener">Open on okobserver.org</a></p>

    <h2>Credits</h2>
    <p>This app is a lightweight reader built with vanilla JS, using the WordPress REST API through a Cloudflare Worker proxy for reliability and speed.</p>
  </section>
`.trim();

function injectScopedStyles(host) {
  const style = document.createElement("style");
  style.textContent = `
    .about { max-width: 900px; margin: 0 auto; padding: 16px; }
    .about h1 { margin: 0 0 12px; color: #1E90FF; }
    .about h2 { margin: 18px 0 8px; color: #1E90FF; }
    .about p { margin: 8px 0; line-height: 1.55; }
    .about a { color: #1E90FF; text-decoration: underline; }
    .about img { display: block; max-width: 100%; height: auto; margin: 10px auto; }
    .about .btn { display: inline-block; padding: 8px 14px; border-radius: 6px; background: #1E90FF; color: #fff; text-decoration: none; }
    @media (max-width: 768px) {
      .about { padding: 14px; }
    }
  `;
  host.appendChild(style);
}

export async function renderAbout() {
  const app = document.getElementById("app");
  if (!app) return;

  // Shell container reused across routes
  const container = h("div", { class: "container" });
  injectScopedStyles(container);

  const content = h("div", { class: "about-content" });
  content.innerHTML = ABOUT_HTML;

  // Ensure all outbound links are safe
  content.querySelectorAll("a[href]").forEach(a => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
  });

  container.appendChild(content);
  app.innerHTML = "";
  app.appendChild(container);

  // Scroll to top for About
  requestAnimationFrame(() => window.scrollTo(0, 0));
}
