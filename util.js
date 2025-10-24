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
