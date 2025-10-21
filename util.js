export const BUILD_VERSION = "0.1";
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
