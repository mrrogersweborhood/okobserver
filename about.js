// about.js — render About page via REST
import { fetchAboutPage } from './api.js';
import { createEl } from './shared.js';

export async function renderAbout(){
  const root = document.getElementById('app'); if (!root) return;
  root.innerHTML = 'Loading…';
  const { title, html } = await fetchAboutPage('contact-about-donate');

  const wrap = createEl('section',{class:'about-wrap'},[
    createEl('h1',{},[title || 'About']),
    createEl('div',{class:'content', html: html || '<p>About page unavailable.</p>'})
  ]);

  root.innerHTML = '';
  root.appendChild(wrap);
}
