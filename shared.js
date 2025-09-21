// shared.js — shared state & constants
export const APP_VERSION = "v2.0.0-mod";
export const BASE = "https://okobserver.org/wp-json/wp/v2";
export const PER_PAGE = 12;
export const EXCLUDE_CAT = "cartoon";

export const app = () => document.getElementById("app");

// Abort controllers (shared)
export const controllers = { listAbort: null, detailAbort: null };

// session cache
try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {};
export const state = (window.__okCache = window.__okCache || {
  posts: [],
  page: 1,
  totalPages: null,
  scrollY: 0,
  homeScrollY: 0,
  scrollAnchorPostId: null,
  returningFromDetail: false,
  isLoading: false,
  _ioAttached: false,
  _io: null,
  _sentinel: null
});

export function stateForSave(st){
  const { _io, _sentinel, isLoading, ...rest } = st || {};
  return rest;
}
export function saveHomeCache(){
  try{ sessionStorage.setItem("__okCache", JSON.stringify(stateForSave(state))); }catch{}
}
(function rehydrate(){
  try{ const raw=sessionStorage.getItem("__okCache"); if(raw) Object.assign(state, JSON.parse(raw)||{}); }catch{}
  state._io = null; state._sentinel = null; state.isLoading = false;
})();

export function isHomeRoute(){
  const h = window.location.hash || "#/";
  return h === "#/" || h === "#";
}

let __isRestoring = false;
let __restoreWatch = null;
export function isRestoring(){ return __isRestoring; }
export function setRestoring(on){
  __isRestoring = !!on;
  try { if (__restoreWatch) clearTimeout(__restoreWatch); } catch {};
  if (on) { __restoreWatch = setTimeout(() => { __isRestoring = false; }, 3000); }
}

export const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
