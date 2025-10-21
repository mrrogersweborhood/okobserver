import { el } from '../lib/util.js';

export default function About(){
  const root = el('section', { className: 'detail' },
    el('h1', { className: 'headline' }, 'About OkObserver'),
    el('p', {}, 'To comfort the afflicted and afflict the comfortable.'),
    el('p', {}, 'Independent reporting. Contact: editor@okobserver.org')
  );
  return { mount(el){ el.replaceChildren(root); }, unmount(){} };
}
