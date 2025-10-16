// scroll-restore.js — remembers and restores the home list scroll.
// Non-invasive: no imports, no coupling to your router, no style changes.

(function () {
  const KEY = "okobs:scroll:home";
  const HOME_HASHES = new Set(["", "#", "#/"]);

  // Save scroll before navigating to a post
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href^='#/post/']");
    if (!a) return;
    try {
      sessionStorage.setItem(KEY, String(window.scrollY || window.pageYOffset || 0));
    } catch {}
  });

  // On load/hashchange, restore when at home. Wait briefly for content.
  function tryRestore() {
    if (!HOME_HASHES.has(location.hash)) return;

    let tries = 0;
    const maxTries = 15; // ~750ms
    const delay = 50;

    function tick() {
      tries++;
      // Heuristic: adjust selectors to your grid/card wrappers if you want
      const ready =
        document.querySelector(".posts-grid, .post-card, #app article, #app section, #app .cards");

      if (ready || tries >= maxTries) {
        const y = parseInt(sessionStorage.getItem(KEY) || "0", 10);
        if (!isNaN(y) && y > 0) {
          window.scrollTo(0, y); // no smooth scroll to avoid fighting lazy loaders
        }
        try { sessionStorage.removeItem(KEY); } catch {}
      } else {
        setTimeout(tick, delay);
      }
    }

    setTimeout(tick, delay);
  }

  window.addEventListener("hashchange", tryRestore, { passive: true });
  window.addEventListener("load", tryRestore, { once: true, passive: true });
})();
