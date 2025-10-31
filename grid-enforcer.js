/* ======================================================================
   OkObserver — grid-enforcer.js
   Purpose: If CSS ever loses, forcibly enforce 4/3/1 grid via JS.
   Safe, non-module, GH Pages friendly. Keep small.
   ====================================================================== */
(function () {
  const SELS = [
    '#postsGrid', '.posts-grid', '.cards-grid', '.post-grid', '.post-list', '.entry-grid'
  ];

  function pickGridContainer() {
    for (const s of SELS) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function columnsFor(w) {
    if (w >= 1200) return 4;
    if (w >= 900) return 3;
    return 1;
  }

  function applyGrid(el) {
    const cols = columnsFor(window.innerWidth);
    el.style.display = 'grid';
    el.style.gap = '24px';
    el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  }

  function fixThumbs() {
    document.querySelectorAll(
      '.post-card .thumb img, .card .thumb img, .post-card .media img, .card .media img'
    ).forEach(img => {
      img.style.objectFit = 'contain';
      img.style.width = '100%';
      img.style.height = '100%';
    });
  }

  function tick() {
    const grid = pickGridContainer();
    if (grid) applyGrid(grid);
    fixThumbs();
  }

  // Initial, then on resize
  window.addEventListener('resize', tick, { passive: true });
  document.addEventListener('DOMContentLoaded', tick);
  // MutationObserver to survive re-renders
  new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });

  // Ensure hamburger stays right-justified if header re-renders
  function fixHamburger() {
    const btn = document.querySelector('#hamburger, #hamButton, .menu-toggle, .hamburger-button');
    if (btn) {
      btn.style.marginLeft = 'auto';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.width = '40px';
      btn.style.height = '40px';
      btn.style.borderRadius = '10px';
      btn.style.background = 'rgba(255,255,255,.14)';
      btn.style.color = '#fff';
    }
  }
  fixHamburger();
  new MutationObserver(fixHamburger).observe(document.body, { childList: true, subtree: true });
})();
