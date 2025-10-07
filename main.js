// main.js — entry: lock API base and start router
const WORKER_BASE = 'https://okobserver-proxy.bob-b5c.workers.dev/wp/v2';
try { sessionStorage.setItem('__oko_api_base_lock', WORKER_BASE); } catch {}
window.OKO_API_BASE = WORKER_BASE;

import { router, saveScrollForRoute } from './core.js';

// Save list scroll before navigating away
window.addEventListener('hashchange', () => saveScrollForRoute(location.hash), { passive:true });

// Start router
window.addEventListener('hashchange', router, { passive:true });
window.addEventListener('DOMContentLoaded', router, { once:true, passive:true });

console.log('[OkObserver] Entry loaded: v2.4.1, API base:', WORKER_BASE);
