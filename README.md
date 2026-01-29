# OkObserver App

**OkObserver** is a custom, production‑grade single‑page application (SPA) for *The Oklahoma Observer*. It runs as a static site on GitHub Pages and consumes WordPress content exclusively through a Cloudflare Worker proxy. The project prioritizes layout stability, editorial fidelity, and predictable deployments over speculative optimization.

Live site: https://mrrogersweborhood.github.io/okobserver/

---

## Project Goals

- Preserve the Oklahoma Observer’s visual identity and editorial structure
- Deliver fast first paint with progressive enhancement (excerpt → full post)
- Avoid framework lock‑in (plain JavaScript, no bundlers, no ES modules)
- Maintain strict anti‑regression guarantees for layout, grid, and navigation
- Keep WordPress payloads intact and unmodified

---

## Architecture Overview

### Frontend

- **Type:** Vanilla JavaScript SPA (hash‑based routing)
- **Hosting:** GitHub Pages (`/okobserver/` subdirectory)
- **Key files:**
  - `index.html` — application shell, header, grid, MutationObserver
  - `main.js` — router, data fetching, rendering logic
  - `PostDetail.js` — post detail helpers (no phantom routes)
  - `override.css` — all custom styling and UI polish
  - `sw.js` — service worker with explicit versioning
  - `.nojekyll` — required for GitHub Pages

### Backend / Data

- **WordPress origin:** https://okobserver.org
- **Access path:** Cloudflare Worker proxy only (never direct WP calls)
- **Authentication:** JWT via `/auth/login` and `/auth/logout`
- **Full post endpoint:** `/content/full-post?id=<postId>`
- **Payload rules:**
  - `_embed` data must remain intact (authors, terms, media)
  - No reshaping, filtering, or performance shortcuts without verification

---

## Core UI & Layout Rules (Non‑Negotiable)

- Sticky blue header (`#1E90FF`) with centered logo + motto
- Motto text (case sensitive):
  > To Comfort The Afflicted And Afflict The Comfortable
- Hamburger menu always present
- Responsive grid:
  - Desktop: 4 columns
  - Tablet: 3 columns
  - Mobile: 1 column
- Grid enforced via **MutationObserver** (must never be removed)
- White cards with rounded corners and soft shadows
- Featured images fully contained (no cropping regressions)
- Single “Back to Posts” button at bottom of post detail

---

## Post Detail Rendering Flow

1. Fast shell render
2. Hero image
3. Title
4. Byline
5. Inline status text: *“Loading full article…”*
6. Excerpt prefill (cleaned for logged‑in users)
7. Full post JSON fetch
8. Content replacement (no layout shift)

This order is intentional and should not be changed without review.

---

## Author Data

- Author info is sourced from WordPress `_embedded.author`
- Avatar URLs are read from `avatar_urls`
- Bio content may contain HTML and must be rendered safely
- Author box appears on desktop and mobile

---

## Service Worker Rules

- Service worker lives at repo root
- Every change must bump a version string (`?v=YYYY-MM-DDx`)
- Never cache authenticated responses
- Avoid aggressive caching strategies
- When debugging, unregister SW and hard reload

---

## Cloudflare Worker Rules

- Never reshape WordPress payloads
- Never remove `_embed`, `wp:term`, or category data
- Performance changes must be:
  - Measured
  - Minimal
  - Reversible
- When in doubt: stability > speed

---

## Restore Points & Safety

This project uses explicit **restore points** (date‑stamped builds) to guarantee rollback safety.

Before any risky change:

- Back up GitHub Pages source
- Back up Cloudflare Worker script
- Confirm the current restore point

Never assume files are identical unless working from a fresh upload.

---

## Deployment Checklist

1. Verify all files locally
2. Upload only required files
3. Confirm `.nojekyll` is present
4. Bump cache‑busting query strings
5. Update service worker version
6. Clear browser + SW cache
7. Verify header, grid, and post detail

---

## Philosophy

This project favors:

- Determinism over cleverness
- Evidence‑based changes
- Explicit anchors and insertion points
- Reversibility and rollback safety

If something feels fragile, stop and verify.

---

## License / Ownership

All editorial content belongs to *The Oklahoma Observer*.
This repository contains application code and presentation logic only.

