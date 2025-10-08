// about.js — simple render from site page fetched previously (or static)
export async function renderAbout(){
  const app = document.getElementById('app'); if(!app) return;
  app.innerHTML = `
    <div class="about-wrap">
      <h1>About</h1>
      <p>The Oklahoma Observer — independent journalism and commentary.</p>
      <p>Visit <a href="https://okobserver.org" target="_blank" rel="noopener">okobserver.org</a> for subscriptions and more.</p>
    </div>
  `;
}
