// About.js — OkObserver (v2025-10-24b)

import { el } from "./util.js?v=2025-10-24b";

/**
 * Public API: renderAbout(rootEl)
 */
export function renderAbout(rootEl) {
  const target = rootEl || el("#app");
  if (!target) return;

  target.innerHTML = `
    <section class="page page-about">
      <h1>About OkObserver</h1>
      <p>
        OkObserver is a fast, single-page reader for The Oklahoma Observer.
        Our aim is simple: <em>to comfort the afflicted and afflict the comfortable.</em>
      </p>
      <p>
        This app is a lightweight client that pulls public posts via the Observer’s WordPress API,
        adds a clean reading layout, and optimizes media for phones and desktops.
      </p>

      <h2>Credits</h2>
      <ul>
        <li>Design &amp; Build: OkObserver</li>
        <li>Content: The Oklahoma Observer</li>
      </ul>

      <p style="margin-top:1.25rem;">
        <a class="back btn btn-outline" href="#/" data-link>Back to Posts</a>
      </p>
    </section>
  `;
}

export default { renderAbout };
