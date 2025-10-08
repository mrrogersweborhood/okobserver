// shared.js — small utilities used across modules
// v2.4.4

const SCROLL_KEY = '__oko_scroll__';

/* ---------------- DOM helpers ---------------- */
export function createEl(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === 'html') { el.innerHTML = v; continue; }
      if (k === 'class') { el.className = v; continue; }
      el.setAttribute(k, v);
    }
  }
  if (!Array.isArray(children)) children = [children];
  for (const c of children) {
    if (c == null) continue;
    if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  return el;
}

/* ---------------- Text / date helpers ---------------- */
export function decodeEntities(s = '') {
  const txt = document.createElement('textarea');
  txt.innerHTML = s;
  return txt.value;
}

export function ordinalDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const day = d.getDate();
  const ord = (n) => {
    const j = n % 10, k = n % 100;
    if (j === 1 && k !== 11) return n + 'st';
    if (j === 2 && k !== 12) return n + 'nd';
    if (j === 3 && k !== 13) return n + 'rd';
    return n + 'th';
  };
  return d.toLocaleString('en-US', { month: 'long' }) + ' ' + ord(day) + ', ' + d.getFullYear();
}

/* ---------------- Content normalization ---------------- */
// Remove any first-paragraph odd indentation/align injected by WP
export function normalizeFirstParagraph(root) {
  try {
    const first = root.querySelector(':is(p,div,section,article,blockquote)');
    if (first) {
      first.style.textIndent = '0';
      first.style.marginLeft = '0';
      first.style.paddingLeft = '0';
      first.style.textAlign = 'left';
    }
  } catch {}
}

/* ---------------- Scroll restore (Home) ---------------- */
// Called by home.js after it renders the grid. Restores the scroll position that
// was saved before navigating into a post (home.js saves __oko_scroll__ on click).
export function restoreScrollPosition() {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (raw != null) {
      const y = parseInt(raw, 10);
      sessionStorage.removeItem(SCROLL_KEY);
      if (!Number.isNaN(y)) {
        // Use rAF to ensure layout is ready before jumping
        requestAnimationFrame(() => {
          // Some browsers support 'instant'; fall back to 'auto'
          const behavior = ('instant' in window) ? 'instant' : 'auto';
          window.scrollTo({ top: y, behavior });
        });
        return;
      }
    }
  } catch {}
  // Default: ensure we start at top if nothing saved
  requestAnimationFrame(() => window.scrollTo({ top: 0 }));
}
