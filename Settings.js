// Settings.js — v2025-10-24e
import { el } from './util.js?v=2025-10-24e';

export async function renderSettings(mount) {
  mount.innerHTML = '';

  const clearCache = el('button', {
    class: 'btn btn-primary',
    onclick: async () => {
      // Clear service worker caches
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // Clear local/session storage
      localStorage.clear();
      sessionStorage.clear();

      alert('Cache and local storage cleared. The app will now reload.');
      location.reload(true);
    }
  }, 'Clear Session Cache');

  const section = el('section', { class: 'container content' },
    el('h2', {}, 'Settings'),
    el('p', {}, 'Use this panel for local maintenance tasks.'),
    el('div', { class: 'settings-item' },
      clearCache
    )
  );

  mount.appendChild(section);
}
