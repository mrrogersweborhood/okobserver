// About.js — v2025-10-24e
import { el } from './util.js?v=2025-10-24e';

export async function renderAbout(mount) {
  mount.innerHTML = '';
  mount.appendChild(
    el('section', { class: 'container content' },
      el('h2', {}, 'About'),
      el('p', {}, 'OkObserver is an independent publication dedicated to comforting the afflicted and afflicting the comfortable.'),
      el('p', {}, 'Founded in 1969, it remains a vital voice for progressive commentary and investigative journalism in Oklahoma.'),
      el('p', {}, 'For subscriptions, contact editor@okobserver.org or visit okobserver.org.')
    )
  );
}
