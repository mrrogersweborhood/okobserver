# OkObserver — Production SPA + Android WebView App

## Overview
OkObserver is a lightweight, production-ready news application built as:

- Static SPA hosted on GitHub Pages
- Cloudflare Worker proxy for WordPress API
- Android WebView wrapper

Live site:  
https://mrrogersweborhood.github.io/okobserver/

---

## Architecture

### Frontend (GitHub Pages)
- No frameworks
- No build tools
- Plain JavaScript only

Core files:
- index.html → app shell
- main.js → logic, routing, rendering
- override.css → styling
- PostDetail.js → detail view
- sw.js → service worker
- manifest.json → PWA config
- logo.png / favicon.ico → assets
- Newspaper_Rolls_Into_Cartoon_Cell_Phone.mp4 → splash

---

### Backend (Cloudflare Worker)
- Proxy to WordPress REST API
- Handles:
  - CORS
  - Auth passthrough
  - Response shaping

Endpoint:
https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/

---

### Android App
- WebView loads:
  https://mrrogersweborhood.github.io/okobserver/

Key rules:
- Edge-to-edge via WindowInsets
- Status bar = transparent (system-controlled)
- No theme hacks for layout
- Autoplay enabled

---

## Core Rules (DO NOT BREAK)

### 1. Worker is the ONLY data source
- Never call WordPress directly
- Always use the Worker

---

### 2. No build system
- No bundlers
- No ES modules
- GitHub Pages compatible only

---

### 3. Service Worker is critical
- Controls caching
- Can serve stale content if mismanaged
- ALWAYS bump cache on updates

---

### 4. File set is intentionally minimal

Runtime files ONLY:

.nojekyll  
index.html  
main.js  
override.css  
PostDetail.js  
sw.js  
manifest.json  
logo.png  
favicon.ico  
Newspaper_Rolls_Into_Cartoon_Cell_Phone.mp4  
offline.html  
worker.js  

---

## Deployment Workflow

After ANY change to:
- main.js
- index.html
- sw.js
- override.css

### Required steps:

1. Update cache-buster in index.html  
   Example:
   main.js?v=2026-04-05a

2. Commit + push to GitHub

3. Clear cache:
   - Desktop: Ctrl + Shift + R
   - Android: close app → reopen

4. Verify:
   - DevTools → Network tab shows new version
   - Service Worker updated

---

## Performance Notes

- Infinite scroll optimized
- Older posts may be trimmed
- Scroll-back remains stable

---

## Troubleshooting

### App shows old content
→ Service Worker cache issue  
Fix:
- Hard refresh
- Unregister SW in DevTools

---

### Slow loading on page 2+
→ Check:
- Worker response speed
- Duplicate fetches

---

### Android layout issues
→ Must use WindowInsets  
→ Never rely on theme hacks

---

## Development Rules

- Never guess file contents
- Never leave duplicate files
- Never introduce unused scripts
- Always keep repo clean
- Always test after deploy

---

## Future Enhancements

- Play Store release
- Push notifications
- Analytics
- Offline improvements

---

## Author
Robert Rogers  
The Oklahoma Observer

---

## License
Private / Proprietary