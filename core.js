// core.js — router + scroll save/restore for home route

const SCROLL_KEY = '__oko_scroll__';

export function saveScrollForRoute(hash){
  try{
    if ((hash || location.hash || '#/') === '#/'){
      sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0));
    }
  }catch{}
}

function restoreHomeScrollSoon(){
  try{
    const y = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
    setTimeout(()=>{ window.scrollTo({ top:y, behavior:('instant' in window)?'instant':'auto' }); }, 50);
  }catch{}
}

export async function router(force = false){
  const hash = location.hash || '#/';
  const app = document.getElementById('app');
  if (!app) return;

  // Home
  if (hash === '#/' || hash === '#') {
    // Force re-render each time we hit home so Back-to-posts always shows grid
    const { renderHome } = await import('./home.js');
    await renderHome({ force });
    restoreHomeScrollSoon();
    return;
  }

  // Post detail
  const m = hash.match(/^#\/post\/(\d+)(?:[\/?].*)?$/);
  if (m){
    const { renderPost } = await import('./detail.js');
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
  await renderHome({ force:true });
  restoreHomeScrollSoon();
}
