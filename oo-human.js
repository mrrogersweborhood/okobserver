// 🟢 oo-human.js
// People only. The app's server (worker.js) asks for a "pass" that is given after Cloudflare Turnstile has seen a
// real browser being used by a person; automated and headless browsers are turned away.
// Readers normally see nothing: a card appears only when the server requires the pass and Turnstile wants a tap,
// or the check cannot run.
// Nothing here blocks the app unless the server asks for the pass (HUMAN_CHECK = "on" in wrangler.toml).
// KILL SWITCH: set window.OO_HUMAN_CHECK = false in index.html (and HUMAN_CHECK = "off" on the server).
(function () {
  'use strict';
  if (window.OO_HUMAN_CHECK === false || !window.fetch) return;

  const SERVER = 'https://okobserver-proxy.bob-b5c.workers.dev';
  const SITE_KEY = window.OO_TURNSTILE_KEY || '0x4AAAAAAF4CKtfqrKHm416M'; // the widget the sign-in screen already uses
  const STORE = 'ooHuman';
  const serverOrigin = new URL(SERVER, location.href).origin;
  const plainFetch = window.fetch.bind(window);

  let held = null;        // { pass, expires }
  let checking = null;    // the check in progress
  let blocked = false;    // the server has refused something until the check is passed
  let box = null;

  try { held = JSON.parse(localStorage.getItem(STORE)); } catch (_) {}
  const current = () => (held && held.pass && held.expires * 1000 > Date.now() + 60000 ? held.pass : '');
  function keep(v) {
    held = v;
    try { if (v) localStorage.setItem(STORE, JSON.stringify(v)); else localStorage.removeItem(STORE); } catch (_) {}
  }

  function card() {
    if (box) return box;
    const st = document.createElement('style');
    st.textContent = '.oo-human{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(3,18,60,.9);opacity:0;pointer-events:none}'
      + '.oo-human.show{opacity:1;pointer-events:auto}'
      + '.oo-human-card{box-sizing:border-box;width:100%;max-width:340px;padding:22px 18px;border-radius:18px;background:#fff;color:#0b2a66;text-align:center;font:400 15px/1.5 "Open Sans",Verdana,sans-serif}'
      + '.oo-human-card h2{margin:0 0 6px;font:700 22px/1.25 "Source Serif 4",Georgia,serif;color:#0b2a66}'
      + '.oo-human-card p{margin:0 0 14px}'
      + '.oo-human-widget{display:flex;justify-content:center}'
      + '.oo-human-card button{min-height:44px;padding:0 26px;border:0;border-radius:99px;background:#0b3d91;color:#fff;font:700 15px/1 "Open Sans",Verdana,sans-serif;cursor:pointer}';
    document.head.appendChild(st);
    box = document.createElement('div');
    box.className = 'oo-human';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'A quick check');
    box.innerHTML = '<div class="oo-human-card"><h2>One quick check</h2><p>Please confirm you are a person to read the Observer.</p><div class="oo-human-widget"></div><button type="button" hidden>Try again</button></div>';
    document.body.appendChild(box);
    return box;
  }

  function script() {
    return new Promise((done, fail) => {
      if (window.turnstile) return done();
      let sc = document.getElementById('oo-turnstile-js');
      if (!sc) {
        sc = document.createElement('script');
        sc.id = 'oo-turnstile-js';
        sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        sc.async = true;
        document.head.appendChild(sc);
      }
      sc.addEventListener('load', () => done());
      sc.addEventListener('error', () => { sc.remove(); fail(new Error('check did not load')); });
    });
  }

  // Resolves with a pass, or '' when none can be had.
  function check() {
    if (checking) return checking;
    checking = new Promise((resolve) => {
      let tapped = false; let widget = null; let timer = 0;
      const end = (pass) => {
        clearTimeout(timer);
        try { if (widget !== null) window.turnstile.remove(widget); } catch (_) {}
        if (box) { box.remove(); box = null; }
        checking = null;
        // after a tap, earlier requests may have given up waiting: start the screen again, now with the pass
        if (pass && tapped && blocked) location.reload();
        resolve(pass);
      };
      const stuck = () => {
        clearTimeout(timer);
        if (!blocked) return end(''); // nothing is waiting on it: say nothing
        const c = card();
        c.querySelector('p').textContent = 'The check could not finish. Please check your connection, turn off any content blocker for this app, and try again.';
        const again = c.querySelector('button');
        again.hidden = false;
        again.onclick = () => location.reload();
        c.classList.add('show');
      };
      script().then(() => {
        const c = card();
        timer = setTimeout(stuck, 20000);
        widget = window.turnstile.render(c.querySelector('.oo-human-widget'), {
          sitekey: SITE_KEY,
          theme: 'light',
          appearance: 'interaction-only',
          // A card is shown only when the server has refused something. Otherwise the reader is never interrupted.
          'before-interactive-callback': () => {
            if (!blocked) return end('');
            tapped = true; clearTimeout(timer); c.classList.add('show');
          },
          'error-callback': () => { stuck(); return true; },
          callback: (token) => {
            plainFetch(SERVER + '/human', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnstile: token }) })
              .then((r) => r.json())
              .then((d) => {
                if (!d || !d.pass) return stuck();
                keep({ pass: d.pass, expires: d.expires });
                end(d.pass);
              })
              .catch(stuck);
          }
        });
      }).catch(stuck);
    });
    return checking;
  }

  window.fetch = async function (input, init) {
    const isText = typeof input === 'string' || input instanceof URL;
    let url;
    try { url = new URL(isText ? input : input.url, location.href); } catch (_) { return plainFetch(input, init); }
    const method = String((init && init.method) || (!isText && input.method) || 'GET').toUpperCase();
    if (url.origin !== serverOrigin || !/^\/(wp-json|content)\//.test(url.pathname) || (method !== 'GET' && method !== 'HEAD')) {
      return plainFetch(input, init);
    }
    const send = (pass) => {
      if (!pass) return plainFetch(input, init);
      const u = new URL(url.href);
      u.searchParams.set('ooh', pass);
      return plainFetch(isText ? u.href : new Request(u.href, input), init);
    };
    const first = await send(current());
    if (first.status !== 403) return first;
    let why = null;
    try { why = await first.clone().json(); } catch (_) {}
    if (!why || why.code !== 'oo_human_required') return first;
    blocked = true;
    keep(null);
    const pass = await check();
    return pass ? send(pass) : first;
  };

  // Get the pass in the background as the app opens, so it is ready before it is needed.
  const start = () => { if (!current()) check(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
// 🔴 oo-human.js
