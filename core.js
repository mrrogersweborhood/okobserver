// core.js — router + scroll restore
const SCROLL_KEY = '__oko_scroll__';

export function saveScrollForRoute(hash){
  // Save only for home route (#/)
  try{
    if ((hash || location.hash || '#/') === '#/'){
      sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0));
    }
  }catch{}
}

function restoreHomeScrollSoon(){
  try{
    const y = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
    // Delay until the grid paints
    setTimeout(()=>{ window.scrollTo({ top:y, behavior:'instant' in window ? 'instant' : 'auto' }); }, 50);
  }catch{}
}

export async function router(){
  const hash = location.hash || '#/';
  const app = document.getElementById('app'); if (!app) return;

  // Home
  if (hash === '#/' || hash === '#') {
    const { renderHome } = await import('./home.js');
    await renderHome();
    restoreHomeScrollSoon();
    return;
  }

  // Post detail
  const m = hash.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);
  if (m){
    const { renderPost } = await import('./detail.js'));
    await renderPost(m[1]);
    return;
  }

  // About
  if (hash.startsWith('#/about')){
    const { renderAbout } = await import('./about.js');
    await renderAbout();
    return;
  }

  // Fallback → home
  const { renderHome } = await import('./home.js');
  await renderHome();
  restoreHomeScrollSoon();
}
