OkObserver App

OkObserver is a custom single-page application (SPA) for The Oklahoma Observer, built with vanilla JavaScript and deployed via GitHub Pages, with all WordPress data and authentication handled through a Cloudflare Worker proxy.

This repository is the authoritative frontend source for the live app.

🔗 Live Deployment

App (GitHub Pages)
https://mrrogersweborhood.github.io/okobserver/

Repository
mrrogersweborhood/okobserver

⚠️ Important:
The app is hosted under the subpath:

/okobserver/


All asset paths and Service Worker scope must respect this.

🧱 Architecture Overview
Frontend (GitHub Pages)

Vanilla JavaScript SPA (no frameworks, no ES modules)

No build step / no bundlers

Files served directly from repo root

Backend / API (Cloudflare Worker)

Proxies all WordPress REST API requests

Handles authentication (JWT)

Serves logged-in full post content

Prevents direct WordPress origin access

🌐 Cloudflare Worker Endpoints

Proxy base

https://okobserver-proxy.bob-b5c.workers.dev/


WordPress REST

/wp-json/wp/v2/...


Auth

/auth/login
/auth/logout
/auth/status


Logged-in full content

/content/full-post?id=<postId>


⚠️ Hard rule:
The Worker must never reshape or remove WordPress payload data, including:

_embed

wp:term

tags

categories

📂 Core Files (Frontend)

These files define the app and are treated as authoritative:

index.html        # App shell, header, layout, routing mount
main.js           # Router, fetch logic, list views, infinite scroll
PostDetail.js     # Post detail rendering (may be no-op in some builds)
override.css      # All custom styling
sw.js             # Service Worker (cache + offline handling)
.nojekyll         # Required for GitHub Pages
logo.png
favicon.ico
Splash video file (if present)


⚠️ Rules

No ES module syntax

No framework imports

No speculative file edits

Always bump cache-busting query strings on changes

🧭 UI & Behavior (Verified at Checkpoint)

Checkpoint: OkObserver Build 2026-02-03

Global UI

Sticky blue header (#1E90FF)

Centered logo + motto
“To Comfort The Afflicted And Afflict The Comfortable”

Hamburger menu (desktop + mobile)

Responsive grid:

Desktop: 4 columns

Tablet: 3 columns

Mobile: 1 column

Grid stability enforced via MutationObserver

Home / Search

Infinite scroll

Cartoon category posts filtered out

Search grid margins stable

Mobile spacing verified

Post Detail

Fast shell render with excerpt prefill

Spinner + “Loading…” text while full post loads

Loading indicator appears directly under the byline

Full content swaps in seamlessly

Tags render correctly

Categories are NOT shown as tags on detail

Categories remain present in payload for filtering logic

Author Box

Avatar + name visible

Bio renders HTML-safe

Stable on desktop and mobile

🧪 Data Safety Guarantees

At this checkpoint, the following are verified intact:

_embedded["wp:term"] exists in API responses

Tags and categories are present in payload

Category slugs remain detectable (cartoon filtering works)

No payload reshaping in frontend or Worker

⚠️ Known Gotcha

Mobile browsers (especially iOS Safari / Chrome iOS) may show stale UI after deploys due to aggressive caching.

If UI looks wrong on mobile:

Clear site data

Unregister Service Worker

Reload the page

Reload again

This is expected behavior.

🔒 Development Rules (Non-Negotiable)
File Authority

Never guess from memory

Always work from freshly uploaded files

Never refer to code that isn’t present

Changes

Every change must specify:

File name

Exact anchor text that exists

Exact change (no vague language)

Full-File Replacements

Avoid unless absolutely necessary

Must be explicitly justified

Must use 🟢 / 🔴 filename markers inside comments only

If interrupted, restart cleanly

Service Worker

Extremely fragile

Be conservative

Always bump cache versions

Expect mobile caches to lie

🚫 Out of Scope (By Default)

Do not begin with:

Worker refactors

Payload filtering or reshaping

Performance “optimizations” without measurement

Header or grid redesigns

Risky Service Worker changes

✅ Safe Next Steps

Allowed, low-risk work:

Measurement-only performance analysis

Minor CSS polish

Documentation updates

Editorial changes in WordPress

Wrapper-based app packaging (TWA/WebView) without logic changes

🏁 Deployment Checklist

After any change:

Bump ?v= cache-busting query strings

Update Service Worker version if applicable

Deploy to GitHub Pages

Verify via DevTools:

Network

Console

Expect mobile cache clearing to be required

🧠 Baseline Truth

Treat OkObserver Build 2026-02-03 as the baseline truth for all future work in this repository.

When in doubt: stop, verify, and measure first.