// /About.js
import { el } from './util.js';

export default function About() {
  const root = el('section', { className: 'detail' },
    el('h1', { className: 'headline' }, 'About OkObserver'),
    el('p', {}, 'To comfort the afflicted and afflict the comfortable.'),
    el('p', {}, 'Independent reporting since 1969.'),
    el('p', {}, 'Contact: editor@okobserver.org'),
    el('p', {}, 'Subscribe at okobserver.org/subscribe for print and digital editions.'),
    el('a', { href: '#/', className: 'back', 'data-link': true }, 'Back to Posts')
  );

  return {
    mount(el) { el.replaceChildren(root); },
    unmount() {}
  };
}
