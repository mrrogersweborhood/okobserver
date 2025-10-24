// util.js — Utility helpers (v2025-10-24b)

/**
 * Shorthand DOM selector
 * @param {string} selector
 * @param {ParentNode} [scope=document]
 * @returns {Element|null}
 */
export function el(selector, scope = document) {
  try {
    return (scope || document).querySelector(selector);
  } catch {
    return null;
  }
}

/**
 * Decode WordPress / HTML entities safely
 * @param {string} str
 * @returns {string}
 */
export function decodeHTML(str = "") {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

/**
 * Format an ISO/WP date string as "Mon DD, YYYY"
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr || "";
  }
}

/**
 * Clear in-browser app cache/state (non-destructive to SW).
 * - Clears sessionStorage entirely.
 * - Removes localStorage keys that look like they belong to OkObserver.
 *   (prefix match: "okobserver", "okob_", "okobs_")
 * Returns an object with counts for visibility in Settings UI.
 */
export function clearMem() {
  let removedLocal = 0;
  let removedSession = 0;

  try {
    // session
    removedSession = sessionStorage.length;
    sessionStorage.clear();
  } catch {}

  try {
    // local
    const prefixes = ["okobserver", "okob_", "okobs_"];
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      keys.push(k);
    }
    keys.forEach((k) => {
      if (prefixes.some((p) => (k || "").toLowerCase().startsWith(p))) {
        try {
          localStorage.removeItem(k);
          removedLocal++;
        } catch {}
      }
    });
  } catch {}

  return { removedLocal, removedSession };
}
