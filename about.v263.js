// about.v263.js — OkObserver v2.6.4
// Displays About page content for The Oklahoma Observer

export default async function renderAbout(app) {
  try {
    app.innerHTML = `
      <section class="about">
        <h1>About The Oklahoma Observer</h1>

        <p>
          <strong>The Oklahoma Observer</strong> has been serving readers since 1969 —
          <em>comforting the afflicted and afflicting the comfortable</em>. Founded by
          <strong>Frosty and Helen Troy</strong>, and now led by
          <strong>Arnold Hamilton</strong>, The Observer remains a beacon for
          independent journalism, dedicated to truth, transparency, and accountability
          in Oklahoma’s public life.
        </p>

        <p>
          The publication’s mission is simple: to provide insightful analysis and
          fearless reporting on the issues that matter most to Oklahomans — politics,
          policy, education, social justice, and beyond. The Observer is a monthly
          magazine and digital platform offering in-depth reporting and sharp opinion
          from a range of Oklahoma voices.
        </p>

        <h2>Editorial Leadership</h2>
        <ul class="staff-list">
          <li><strong>Arnold Hamilton</strong> — Editor</li>
          <li><strong>Frosty Troy</strong> — Founding Editor</li>
          <li><strong>Helen B. Troy</strong> — Founding Publisher</li>
        </ul>

        <h2>Contact & Subscriptions</h2>
        <p>
          <strong>Mailing Address:</strong><br />
          The Oklahoma Observer<br />
          P.O. Box 14275<br />
          Oklahoma City, OK 73113
        </p>

        <p>
          <strong>Email:</strong>
          <a href="mailto:okobserver@cox.net">okobserver@cox.net</a><br />
          <strong>Phone:</strong> (405) 478-8700
        </p>

        <p>
          <strong>Subscriptions:</strong><br />
          Visit <a href="https://okobserver.org" target="_blank" rel="noopener">
            okobserver.org
          </a> to subscribe online or learn more about our publication.
        </p>

        <hr />
        <p class="mission">
          “To comfort the afflicted and afflict the comfortable.”
        </p>
      </section>
    `;

    // Inject consistent styling for layout and theme
    const style = document.createElement("style");
    style.textContent = `
      .about {
        max-width: 800px;
        margin: 2em auto;
        padding: 0 1em;
        line-height: 1.7;
        color: #222;
      }
      .about h1 {
        font-size: 1.8em;
        border-bottom: 3px solid var(--brand, #1e90ff);
        padding-bottom: 0.3em;
        margin-bottom: 1em;
      }
      .about h2 {
        font-size: 1.3em;
        margin-top: 1.5em;
        color: var(--brand, #1e90ff);
      }
      .about p {
        margin: 0.8em 0;
      }
      .about ul.staff-list {
        list-style: none;
        padding: 0;
        margin: 0.5em 0 1.5em;
      }
      .about ul.staff-list li {
        padding: 0.2em 0;
      }
      .about a {
        color: var(--brand, #1e90ff);
        text-decoration: none;
      }
      .about a:hover {
        text-decoration: underline;
      }
      .about hr {
        margin: 2em 0;
        border: none;
        border-top: 1px solid #ccc;
      }
      .about .mission {
        font-style: italic;
        text-align: center;
        font-size: 1.1em;
        color: #444;
      }
    `;
    document.head.appendChild(style);
  } catch (err) {
    console.error("[About render error]", err);
    app.innerHTML = `
      <p style="color:red; text-align:center; margin-top:2em;">
        Page error: ${err.message}
      </p>
    `;
  }
}
