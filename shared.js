// shared.js — small utilities shared across modules

export const SS = {
  get(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set(key, val) {
    try { sessionStorage.setItem(key, val); } catch {}
  },
  del(key) {
    try { sessionStorage.removeItem(key); } catch {}
  }
};

// Keys for Home snapshot
export const HOME_SNAPSHOT_KEY = "__home_snapshot_v3";
export const HOME_SNAPSHOT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function now() { return Date.now(); }

// Helper: cheap debounce used by Home rebinds if needed
export function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
