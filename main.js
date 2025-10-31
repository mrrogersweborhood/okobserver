/* main.js — OkObserver SPA bootstrap (2025-10-31p)
   - No filename changes anywhere.
   - Strong cache-bust for modules via a deploy-stable token.
   - Preserves 31h routing/signatures; Settings loader resilient.
*/
(function () {
  const VER = "2025-10-31p";                  // <= bump on deploy
  const BUST = `?v=${VER}`;                   // primary cache-buster
  const CB   = `&cb=${VER}-h1`;               // extra token for modules (change when deploying)

  const $app =
    document.getElementById("app") ||
    document.querySelector("#app") ||
    document.querySelector("main") ||
    document.body;

  function setApp(html){ if ($app) $app.innerHTML = html; }
  function showLoading(){ setApp(`<div class="loading" style="padding:1rem 0;">Loading…</div>`); }
  function showError(t,d=""){ setApp(`<div style="padding:2rem 0;max-width:900px;margin:0 auto;"><h3 style="margin:0 0 .5rem 0;">${t}</h3>${d?`<div style="color:#666">${d}</div>`:""}</div>`); }
  function showNotFound(){ showError("Page not found."); }
  function parseHash(){
    const raw=(location.hash||"").replace(/^#\/?/, "");
    const parts=raw.split("/").filter(Boolean);
    return { route: parts[0] || "", param: parts[1] || "", raw };
  }

  async function goHome(){
    showLoading();
    try{
      // NOTE: keep filename; add strong query token so stale SW/cache can’t match.
      const { renderHome, default: def } = await import(`./Home.js${BUST}${CB}`);
      const fn = typeof renderHome==="function" ? renderHome : def;
      if (typeof fn==="function") await fn($app,{ VER });
      else showError("Home module not found.");
    }catch(err){ console.error(err); showError("Network error while loading posts. Please retry."); }
  }

  async function goPost(id){
    if (!id || !/^\d+$/.test(id)) return showNotFound();
    showLoading();
    try{
      const { renderPost, default: def } = await import(`./PostDetail.js${BUST}${CB}`);
      const fn = typeof renderPost==="function" ? renderPost : def;
      if (typeof fn==="function") await fn(Number(id),{ VER });
      else showError("PostDetail module not found.");
    }catch(err){ console.error(err); showError("Failed to load post.", String(err?.message||err||"")); }
  }

  async function goAbout(){
    showLoading();
    try{
      const mod = await import(`./About.js${BUST}${CB}`);
      const fn = typeof mod.renderAbout==="function" ? mod.renderAbout : mod.default;
      if (typeof fn==="function") await fn($app,{ VER });
      else setApp("<div class='loading'>About…</div>");
    }catch(e){ showError("Unable to load About right now."); }
  }

  async function goSettings(){
    showLoading();
    try{
      const mod = await import(`./Settings.js${BUST}${CB}`);
      const fn = typeof mod.renderSettings==="function" ? mod.renderSettings : mod.default;
      if (typeof fn==="function") await fn($app,{ VER });
      else setApp("<div class='loading'>Settings…</div>");
    }catch(e){ showError("Unable to load Settings right now."); }
  }

  async function router(){
    const h=parseHash();
    console.log(`[OkObserver] Router ${VER} • route "#/${h.raw||""}"`);
    switch(h.route){
      case "":
      case "home":
      case "posts": await goHome(); break;
      case "post": await goPost(h.param); break;
      case "about": await goAbout(); break;
      case "settings": await goSettings(); break;
      default: showNotFound();
    }
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("DOMContentLoaded", ()=>{
    const y=document.getElementById("year"); if (y) y.textContent=new Date().getFullYear();
    const b=document.getElementById("build"); if (b) b.textContent=`Build ${VER}`;
    router();
  });

  window.__OKO = { VER, router, parseHash };
})();
