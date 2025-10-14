// core-fixed.js — Hash router + scroll memory (v=265)

const app = document.getElementById('app');

const state = {
  listScrollY: 0,
};

// tiny helper
function el(tag, className, html) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (html != null) n.innerHTML = html;
  return n;
}

export default async function start() {
  await router();
  window.addEventListener('hashchange', router, { passive: true });
}

async function router() {
  if (!app) return;

  const hash = (window.location.hash || '#/').replace(/^#\//, '');
  const [route, id] = hash.split('/');

  // shell
  app.innerHTML = '';
  const shell = el('div', 'route-shell', `<p style="opacity:.7">Loading…</p>`);
  app.appendChild(shell);

  try {
    // HOME (post list)
    if (!route || route === '') {
      const mod = await import('./home.js?v=265'); // use your actual filenames
      await mod.default(app, {
        onBeforeLeave: () => (state.listScrollY = window.scrollY),
      });
      // restore scroll position when coming back
      requestAnimationFrame(() => window.scrollTo(0, state.listScrollY || 0));
      return;
    }

    // ABOUT
    if (route === 'about') {
      const mod = await import('./about.js?v=265');
      await mod.default(app);
      return;
    }

    // POST DETAIL
    if (route === 'post' && id) {
      // keep filename exactly as provided below (no renames)
      const mod = await import('./detail.v263.js?v=265');
      // remember list position before going in
      if (document.body) state.listScrollY = window.scrollY;
      await mod.default(app, id);
      return;
    }

    // 404
    app.innerHTML = `<p style="text-align:center;margin-top:2rem;">Page not found</p>`;
  } catch (err) {
    console.error('[Router error]', err);
    app.innerHTML = `<p style="text-align:center;color:red;margin-top:2rem;">
      Page error: ${String((err && err.message) || err)}
    </p>`;
  }
}
