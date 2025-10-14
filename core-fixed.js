// core-fixed.js  (router/bootstrap)  cache bust via ?v=264

const app = document.getElementById('app');

const state = {
  listScrollY: 0,
};

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

  const hash = (window.location.hash || '#/').slice(2);
  const [route, id] = hash.split('/');

  app.innerHTML = '';
  const shell = el('div', 'route-shell', `<p style="opacity:.7">Loading…</p>`);
  app.appendChild(shell);

  try {
    if (!route || route === '') {
      const mod = await import(`./home.v263.js?v=264`);
      await mod.default(app, {
        onBeforeLeave: () => (state.listScrollY = window.scrollY),
      });
      requestAnimationFrame(() => window.scrollTo(0, state.listScrollY || 0));
      return;
    }

    if (route === 'about') {
      const mod = await import(`./about.v263.js?v=264`);
      await mod.default(app);
      return;
    }

    if (route === 'post' && id) {
      // keep filename the same; only bust cache with ?v=264
      const mod = await import(`./detail.v263.js?v=264`);
      if (document.body) state.listScrollY = window.scrollY;
      await mod.default(app, id);
      return;
    }

    app.innerHTML = `<p style="text-align:center;margin-top:2rem;">Page not found</p>`;
  } catch (err) {
    console.error('[Router error]', err);
    app.innerHTML = `<p style="text-align:center;color:red;margin-top:2rem;">
      Page error: ${String((err && err.message) || err)}
    </p>`;
  }
}
