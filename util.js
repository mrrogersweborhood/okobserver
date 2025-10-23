// /util.js
export const BUILD_VERSION = "0.2"; // ⬅ version bump
export const API_BASE = "https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2";

export const qs = (sel, el=document) => el.querySelector(sel);
export const qsa = (sel, el=document) => [...el.querySelectorAll(sel)];
export const el = (tag, props={}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children.flat()) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
};

export const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Decode HTML entities from WordPress `rendered` strings (e.g., &#8217; → ’) */
export function decodeHTML(str = '') {
  const tmp = document.createElement('textarea');
  tmp.innerHTML = str;
  // prefer .value to preserve text as entered; fallback to textContent
  return tmp.value || tmp.textContent || '';
}

export const on = (target, type, handler, opts) => target.addEventListener(type, handler, opts);

export function warnOnce(key, msg){
  if(!warnOnce.seen) warnOnce.seen=new Set();
  if(!warnOnce.seen.has(key)){ console.warn(msg); warnOnce.seen.add(key);}
}

export function gridEnforcer(container){
  const mql = window.matchMedia('(min-width: 1024px)');
  const check = () => {
    const cols = getComputedStyle(container).gridTemplateColumns.split(' ').length;
    if (mql.matches && cols < 3) warnOnce('cols', '[OkObserver] Grid collapsed on desktop; expected ≥3 columns.');
  };
  const mo = new MutationObserver(check); mo.observe(container, { childList: true, subtree: true, attributes: true });
  window.addEventListener('resize', check); check();
  return () => { mo.disconnect(); window.removeEventListener('resize', check); };
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- in-memory list cache + scroll restore helpers ---
export const mem = {
  postsPage: 1,
  posts: [],
  scrollY: 0,
};

// Persist/restore to sessionStorage so refreshes keep state
const SS_KEY = "okobs:list-cache:v1";

// Safe JSON helpers
function safeParse(json, fallback){
  try { return JSON.parse(json); } catch { return fallback; }
}

export function persistMemToSession(){
  try {
    const payload = JSON.stringify({
      postsPage: mem.postsPage,
      posts: mem.posts,
      scrollY: mem.scrollY,
      v: BUILD_VERSION
    });
    sessionStorage.setItem(SS_KEY, payload);
  } catch (e) {
    console.warn('[OkObserver] sessionStorage save failed', e);
  }
}

export function restoreMemFromSession(){
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return false;
    const data = safeParse(raw, null);
    if (!data) return false;
    if (data.v !== BUILD_VERSION) return false;
    mem.postsPage = data.postsPage || 1;
    mem.posts = Array.isArray(data.posts) ? data.posts : [];
    mem.scrollY = data.scrollY || 0;
    return mem.posts.length > 0;
  } catch (e) {
    console.warn('[OkObserver] sessionStorage load failed', e);
    return false;
  }
}

export function saveScroll() {
  mem.scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  persistMemToSession();
}

export function restoreScroll() {
  if (mem.scrollY > 0) {
    requestAnimationFrame(() => window.scrollTo(0, mem.scrollY));
  }
}

// Lightweight error view you can drop anywhere
export function errorView(title = 'Something went wrong', detail = '') {
  return el('div', { className: 'card', style: 'padding:16px' },
    el('h3', { style: 'margin:0 0 8px' }, title),
    detail ? el('div', { className: 'meta' }, String(detail)) : null,
    el('div', { className: 'meta' }, 'Please retry in a moment.')
  );
}

// Helper: attach width/height to img if known to reduce CLS
export function imgWH(src, fallback = { width: 640, height: 360 }) {
  const m = src?.match(/-(\d+)x(\d+)\.(jpg|jpeg|png|webp)$/i);
  if (m) return { width: +m[1], height: +m[2] };
  return fallback;
}

// --- clearing helpers for Settings page ---
export function clearMem(){
  mem.postsPage = 1;
  mem.posts = [];
  mem.scrollY = 0;
}

export function clearSession(){
  try {
    sessionStorage.removeItem(SS_KEY);
  } catch (e) {
    console.warn('[OkObserver] sessionStorage clear failed', e);
  }
}
