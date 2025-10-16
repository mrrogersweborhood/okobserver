// core-fixed.js — robust router for GH Pages with flexible view exports
console.log('[OkObserver] core-fixed.js loaded');

const VERSION = '2025-10-15a';

// Build subfolder-safe, cache-busted URLs
function importWithVersion(relPath) {
  const u = new URL(relPath, import.meta.url);
  u.searchParams.set('v', VERSION);
  return import(u.href);
}

// Call a view export regardless of how the module exported it
function callView(mod, primaryName, app, ...args) {
  // 1) named export
  if (typeof mod?.[primaryName] === 'function') {
    return mod[primaryName](app, ...args);
  }
  // 2) default object with method
  if (mod?.default && typeof mod.default[primaryName] === 'function') {
    return mod.default[primaryName](app, ...args);
  }
  // 3) default function (named or anonymous)
  if (typeof mod?.default === 'function') {
    return mod.default(app, ...args);
  }
  // 4) last resort: any function export
  const anyFn = Object.values(mod).find(v => typeof v === 'function');
  if (anyFn) return anyFn(app, ...args);

  throw new Error(`View module missing ${primaryName}() export`);
}

const loadHome   = () => importWithVersion('./home.v263.js');
const loadDetail = () => importWithVersion('./detail.v263.js');
const loadAbout  = () => importWithVersion('./about.v263.js');

export async function start() {
  const app = document.getElementById('app');
  if (!app) {
    console.warn('[OkObserver] #app not found');
    return;
  }

  const hash = window.location.hash || '#/';
  console.log('[OkObserver] Route:', hash);

  try {
    if (hash.startsWith('#/about')) {
      const mod = await loadAbout();
      callView(mod, 'renderAbout', app);
    } else if (hash.startsWith('#/post/')) {
      const id = hash.split('/')[2];
      const mod = await loadDetail();
      callView(mod, 'renderDetail', app, id);
    } else {
      const mod = await loadHome();
      callView(mod, 'renderHome', app);
    }
  } catch (err) {
    console.error('[OkObserver] Router error:', err);
    app.innerHTML = `
      <div style="padding:1rem;color:#b00020;">
        <strong>Failed to load view.</strong><br/>
        <code>${String(err)}</code>
      </div>`;
  }
}

// Re-render on hash changes
window.addEventListener('hashchange', start);
