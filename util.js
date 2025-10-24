// util.js — v2025-10-24e
// shared DOM/date/html helpers

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class' || k === 'className') node.className = v || '';
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function formatDate(isoOrMs) {
  try {
    const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(String(isoOrMs));
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return String(isoOrMs || ''); }
}

export function decodeHTML(html) {
  if (html == null) return '';
  if (typeof html === 'string' && !/&(?:[a-z]+|#\d+|#x[\da-f]+);/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return doc.documentElement.textContent || '';
}

export function clear(elm) {
  if (!elm) return;
  while (elm.firstChild) elm.removeChild(elm.firstChild);
}

// backward-compat stubs to satisfy imports
export function clearMem() {}
export function clearSession() {}
