// about.v263.js — About page (default export included)

export async function renderAbout(container) {
  const host = container || document.getElementById("app");
  if (!host) {
    console.error("[OkObserver] about container not found");
    return;
  }

  host.innerHTML = `
    <section class="about-wrap">
      <h1>About The Oklahoma Observer</h1>
      <p><strong>The Oklahoma Observer</strong> has been a proud voice for progressive Oklahoma since 1969, founded by Frosty and Helen Troy.</p>
      <p>Today, under editor Arnold Hamilton, the Observer continues its mission:</p>
      <blockquote>To Comfort the Afflicted and Afflict the Comfortable.</blockquote>
      <p>We provide independent analysis, commentary, and investigative reporting on Oklahoma politics, policy, and public life.</p>
      <p><a class="btn" href="https://okobserver.org" target="_blank" rel="noopener">Visit okobserver.org</a></p>
    </section>
  `;
}

export default renderAbout;
