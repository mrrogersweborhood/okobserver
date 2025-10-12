export default async function renderAbout(container){
  const host = container || document.getElementById("app");
  host.innerHTML = `
    <section class="about-wrap">
      <h1>About The Oklahoma Observer</h1>
      <p><strong>The Oklahoma Observer</strong> has been Oklahoma’s progressive voice since 1969.</p>
      <blockquote>To Comfort the Afflicted and Afflict the Comfortable.</blockquote>
      <p><a href="https://okobserver.org" target="_blank" rel="noopener">Visit okobserver.org</a></p>
    </section>`;
}
