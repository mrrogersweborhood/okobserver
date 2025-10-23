// /src/views/Settings.js
import { el, clearMem, clearSession } from '../lib/util.js';

export default function Settings() {
  const statusSS = el('div', { className: 'meta', style: 'margin-top:8px;' });
  const statusSW = el('div', { className: 'meta', style: 'margin-top:8px;' });

  // --- Clear session cache (posts + scroll) ---
  const btnSS = el('button', {
    className: 'back',
    type: 'button',
    style: 'cursor:pointer'
  }, 'Clear session cache');

  btnSS.addEventListener('click', () => {
    clearSession();
    clearMem();
    statusSS.textContent = '✅ Session cache cleared. Posts will reload from scratch.';
  });

  // --- Clear Service Worker runtime caches ---
  const btnSW = el('button', {
    className: 'back',
    type: 'button',
    style: 'cursor:pointer'
  }, 'Clear Service Worker caches');

  btnSW.addEventListener('click', async () => {
    if (!('serviceWorker' in navigator)) {
      statusSW.textContent = ⚠️ Service Worker not supported in this browser.';
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sw = navigator.serviceWorker.controller || (reg && reg.active);
      if (!sw) {
        statusSW.textContent = 'ℹ️ No active Service Worker yet — reload the page and try again.';
        return;
      }

      // Send a message and wait for a one-time response
      const reply = await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => resolve(event.data);
        sw.postMessage({ type: 'CLEAR_RUNTIME_CACHES' }, [channel.port2]);
        // Timeout safety (5 s)
        setTimeout(() => resolve({ ok: false, error: 'Timeout waiting for Service Worker response.' }), 5000);
      });

      if (reply?.ok) {
        statusSW.textContent = '🧹 Service Worker runtime caches cleared.';
      } else {
        statusSW.textContent = '❌ Could not clear SW caches: ' + (reply?.error || 'Unknown error');
      }
    } catch (err) {
      statusSW.textContent = '⚠️ SW error: ' + err.message;
    }
  });

  const root = el('section', { className: 'detail' },
    el('h1', { className: 'headline' }, 'Settings'),
    el('p', {}, 'Manage local data and caches used for speed and offline behavior.'),

    el('div', { className: 'card', style: 'padding:16px; display:grid; gap:8px;' },
      el('strong', {}, 'Session cache'),
      el('p', { className: 'meta', style: 'margin:0' }, 'Clears cached post list and scroll position stored in sessionStorage.'),
      btnSS,
      statusSS
    ),

    el('div', { className: 'card', style: 'padding:16px; display:grid; gap:8px; margin-top:12px;' },
      el('strong', {}, 'Service Worker caches'),
      el('p', { className: 'meta', style: 'margin:0' }, 'Asks the Service Worker to purge its runtime caches. Useful after deploys or version updates.'),
      btnSW,
      statusSW
    ),

    el('a', { href: '#/', className: 'back', 'data-link': true }, 'Back to Posts')
  );

  return {
    mount(el) { el.replaceChildren(root); },
    unmount() { /* nothing */ }
  };
}
