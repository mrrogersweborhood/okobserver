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
 * - Removes localStorage keys that look app-related (okobserver/okob_/okobs_)
 * - Removes sessionStorage keys that look app-related
 * Returns an object with counts for UI feedback.
 */
export function clearMem() {
  let removedLocal = 0;
  let removedSession = 0;

  try {
    const sKeys = [];
    for (let i = 0; i < sessionStorage.length; i++) sKeys.push(sessionStorage.key(i));
    sKeys.forEach((k) => {
      if (/^(okobserver|okob_|okobs_)/i.test(k || "")) {
        try { sessionStorage.removeItem(k); removedSession++; } catch {}
      }
    });
  } catch {}

  try {
    const lKeys = [];
    for (let i = 0; i < localStorage.length; i++) lKeys.push(localStorage.key(i));
    lKeys.forEach((k) => {
      if (/^(okobserver|okob_|okobs_)/i.test(k || "")) {
        try { localStorage.removeItem(k); removedLocal++; } catch {}
      }
    });
  } catch {}

  return { removedLocal, removedSession };
}

/**
 * Clear ALL sessionStorage (fast “session cache” nuke).
 * @returns {number} count of items cleared
 */
export function clearSession() {
  let count = 0;
  try {
    count = sessionStorage.length;
    sessionStorage.clear();
  } catch {}
  return count;
}
