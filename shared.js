// shared.js — shared utilities for OkObserver
// v2.7.7

/** Cache a key/value in sessionStorage safely. */
export function setCache(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); }
  catch (err) { console.warn('[OkObserver] cache write failed', err); }
}

/** Read cached JSON data. */
export function getCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Save scroll position per route (for “Back to Posts” behavior). */
export function saveScrollForRoute(route) {
  if (!route) return;
  try {
    sessionStorage.setItem('__scroll_' + route, String(window.scrollY));
  } catch {}
}

/** Restore scroll position for a given route. */
export function restoreScrollPosition(route) {
  if (!route) return;
  try {
    const y = parseFloat(sessionStorage.getItem('__scroll_' + route));
    if (!isNaN(y)) window.scrollTo({ top: y, behavior: 'auto' });
  } catch {}
}

/** Format readable ordinal date (e.g., “September 5th, 2025”). */
export function ordinalDate(dateStr) {
  const date = new Date(dateStr);
  const d = date.getDate();
  const suffix = (d % 10 === 1 && d !== 11) ? 'st'
               : (d % 10 === 2 && d !== 12) ? 'nd'
               : (d % 10 === 3 && d !== 13) ? 'rd' : 'th';
  return date.toLocaleString('en-US', { month: 'long' }) + ' ' + d + suffix + ', ' + date.getFullYear();
}

/** Decode HTML entities from WordPress excerpts. */
export function decodeHTML(html) {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}
