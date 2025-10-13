// scroll-restore.js — remembers and restores list scroll on OkObserver home view

(function () {
  const KEY = "okobs:scroll:home";
  const HOME_HASHES = new Set(["", "#/", "#"]);

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href^='#/post/']");
    if (!a) return;
    try {
      sessionStorage.setItem(KEY, String(window.scrollY || window.pageYOffset || 0));
    } catch {}
  });

  function tryRestore() {
    if (!HOME_HASHES.has(location.hash)) return;
    let tries = 0;
    const maxTries = 12;
    function tick() {
      tries++;
      const hasContent = document.querySelector(".post-card, .posts-grid, main, article, #app");
      if (hasContent || tries >= maxTries) {
        const y = parseInt(sessionStorage.getItem(KEY) || "0", 10);
        if (!isNaN(y) && y > 0) {
          window.scrollTo({ top: y, behavior: "auto" });
        }
        try { sessionStorage.removeItem(KEY); } catch {}
      } else setTimeout(tick, 50);
    }
    setTimeout(tick, 50);
  }

  window.addEventListener("hashchange", tryRestore, { passive: true });
  window.addEventListener("load", tryRestore, { once: true, passive: true });
})();
