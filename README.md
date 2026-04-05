\# OkObserver — Production SPA + Android WebView App



\## Overview

OkObserver is a lightweight, production-ready news application built as:



\- A \*\*static SPA (Single Page Application)\*\* hosted on GitHub Pages  

\- A \*\*Cloudflare Worker proxy\*\* for WordPress API access  

\- An \*\*Android WebView app wrapper\*\*



Live site:  

https://mrrogersweborhood.github.io/okobserver/



\---



\## Architecture



\### Frontend (GitHub Pages)

\- Pure HTML / CSS / JavaScript (no frameworks, no build tools)

\- Hosted at `/okobserver/`

\- Files:

&#x20; - `index.html` → App shell

&#x20; - `main.js` → Core logic, routing, fetch, rendering

&#x20; - `override.css` → Styling

&#x20; - `PostDetail.js` → Post detail handling

&#x20; - `sw.js` → Service Worker (caching + offline)

&#x20; - `manifest.json` → PWA config

&#x20; - `logo.png`, `favicon.ico` → branding assets

&#x20; - `Newspaper\_Rolls\_Into\_Cartoon\_Cell\_Phone.mp4` → splash animation



\---



\### Backend (Cloudflare Worker)

\- Acts as a proxy to WordPress REST API

\- Handles:

&#x20; - CORS

&#x20; - Authentication passthrough

&#x20; - Response normalization

\- Example endpoint:

&#x20; https://okobserver-proxy.bob-b5c.workers.dev/wp-json/wp/v2/



\---



\### Android App

\- WebView loads:

&#x20; https://mrrogersweborhood.github.io/okobserver/

\- Features:

&#x20; - Edge-to-edge layout with proper insets handling

&#x20; - Status bar integration (transparent, system-controlled)

&#x20; - Splash experience handled natively or via web

&#x20; - Autoplay enabled for video content



\---



\## Core Rules (DO NOT BREAK)



\### 1. Worker is the only data source

\- NEVER call WordPress directly from the frontend

\- ALWAYS use the Cloudflare Worker proxy



\---



\### 2. No build system

\- No bundlers

\- No ES modules

\- Plain JavaScript only (GitHub Pages compatible)



\---



\### 3. Service Worker is critical

\- Controls caching behavior

\- Can cause stale content if mismanaged

\- Always bump cache when updating core files



\---



\### 4. File set is intentionally minimal

Only these files are part of the runtime:



