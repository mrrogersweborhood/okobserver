// /src/views/Settings.js
import { el, clearMem, clearSession } from '../lib/util.js';

export default function Settings(){
  const status = el('div', { className: 'meta', style: 'margin-top:8px;' });

  const btn = el('button', { 
    className: 'back',
    type: 'button',
    style: 'cursor:pointer'
  }, 'Clear session cache');

  btn.addEventListener('click', () => {
    clearSession();
    clearMem();
    status.textContent = 'Cache cleared. Back to Posts will reload from scratch.';
  });

  const root = el('section', { className: 'detail' },
    el('h1', { className: 'headline' }, 'Settings'),
    el('p', {}, 'Manage local, session-scoped data used for speed improvements.'),
    el('div', { className: 'card', style: 'padding:16px; display:grid; gap:8px;' },
      el('strong', {}, 'Session cache'),
      el('p', { className: 'meta', style: 'margin:0' }, 'Clears cached post list and scroll position stored in sessionStorage.'),
      btn,
      status
    ),
    el('a', { href: '#/', className: 'back', 'data-link': true }, 'Back to Posts')
  );

  return {
    mount(el){ el.replaceChildren(root); },
    unmount(){ /* nothing */ }
  };
}
