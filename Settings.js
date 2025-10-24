// Settings.js — OkObserver (v2025-10-24b)

import { el, clearSession, clearMem } from "./util.js?v=2025-10-24b";

/**
 * Render the tiny settings panel with cache tools.
 * @param {HTMLElement} rootEl Optional mount; defaults to #app
 */
export function renderSettings(rootEl) {
  const target = rootEl || el("#app");
  if (!target) return;

  target.innerHTML = `
    <section class="page page-settings">
      <h1>Settings</h1>
      <p class="muted">Maintenance tools for this device only.</p>

      <div class="card">
        <h2>Cache &amp; Storage</h2>
        <div class="settings-actions">
          <button id="btn-clear-session" class="btn btn-primary">
            Clear Session Cache
          </button>
          <button id="btn-clear-mem" class="btn btn-outline">
            Deep Clean (local + session)
          </button>
        </div>
        <p id="settings-result" class="settings-result" aria-live="polite"></p>
      </div>

      <p style="margin-top:1.25rem">
        <a class="back" href="#/" data-link>Back to Posts</a>
      </p>
    </section>
  `;

  // Wire: Clear only sessionStorage (fast)
  const resEl = el("#settings-result", target);
  const btnSession = el("#btn-clear-session", target);
  if (btnSession) {
    btnSession.addEventListener("click", () => {
      try {
        const n = clearSession();
        resEl && (resEl.textContent = `Cleared ${n} item(s) from session storage.`);
      } catch {
        resEl && (resEl.textContent = "Could not clear session storage.");
      }
    });
  }

  // Wire: Clear app-looking keys from localStorage + sessionStorage
  const btnMem = el("#btn-clear-mem", target);
  if (btnMem) {
    btnMem.addEventListener("click", () => {
      try {
        const r = clearMem();
        const parts = [];
        if (r.removedSession) parts.push(`${r.removedSession} session`);
        if (r.removedLocal) parts.push(`${r.removedLocal} local`);
        resEl && (resEl.textContent = parts.length
          ? `Removed ${parts.join(" + ")} item(s).`
          : "No app-related keys found.");
      } catch {
        resEl && (resEl.textContent = "Could not perform deep clean.");
      }
    });
  }
}

export default { renderSettings };
