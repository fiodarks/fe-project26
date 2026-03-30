# Digital Community Archive — Frontend (Project 26)

This frontend is a map-first web UI for a digital community archive: a place where local residents and history enthusiasts can collect and share photos showing how an area changed over time.

The UI goal is simple: make it easy to find photos by *where* and *when*, and keep the contribution flow approachable for non-technical users.

![img.png](img.png)

## What the frontend is responsible for

- A single-screen, map-first interface (Leaflet + OpenStreetMap tiles)
- Searching and filtering materials by text, hierarchy, metadata, date range, and (optionally) current map bounds
- Viewing photo details (including other photos at the same point when coordinates are available)
- Role-based UI actions (Viewer / Creator / Administrator) based on JWT roles
- Sign in / register (email+password) and Google sign-in (OAuth redirect)
- Theme switcher: light / dark / high-contrast

## Roles (what the UI enables)

### Viewer

- Browse materials on the map and open details in a drawer
- Search by place and time using search phrase, location text, hierarchy, metadata filters, and date range (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`)
- Optionally filter search to the current map bounds

### Creator

Everything a Viewer can do, plus:

- Sign in / register (email+password) or continue with Google
- Upload a new photo:
  - pick a point on the map (required)
  - provide title, readable location text, creation date, description
  - optional hierarchy category
- Edit / delete own materials (ownership is derived from JWT and compared to `ownerId` from the API)

### Administrator

Admin-only UI features:

- `#/admin` page: list users, filter them, change their role, block/unblock with a reason and “blocked until” date
- Material details drawer: delete/edit any material and block the material owner

## Tech stack (frontend)

- Vite + React + TypeScript
- Leaflet via CDN (see `index.html`)
- Hash routing (`#/` and `#/admin`) to keep hosting simple

## Running locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/#/`.

For a clean, reproducible install (CI / fresh clone), use `npm ci` instead of `npm install`.

### Production build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

This repo is set up to deploy via GitHub Actions to GitHub Pages (see `.github/workflows/deploy.yml`).

Live site: https://fiodarks.github.io/project26/

1. In GitHub: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Push to `main` (or run the workflow manually from the **Actions** tab).

### Vite `base`

This site is served from https://fiodarks.github.io/project26/, so the correct Vite `base` is `/project26/`.

The config auto-detects the repo name in GitHub Actions via `GITHUB_REPOSITORY`, so you typically don’t need to set anything manually.

### Backend

By default the app calls `http://localhost:8080/api/v1`. Override with `VITE_API_BASE_URL` if needed.

## Sign-in notes (Google OAuth callback)

The SPA handles the OAuth callback path at:

- `http://localhost:5173/api/v1/auth/google/callback`

After exchanging `code`/`state`, the UI stores the JWT in local storage under `dsa_access_token` and returns to `#/`.

## Accessibility & themes

The UI includes light/dark/high-contrast themes and is built with accessibility in mind (labels, keyboard-friendly controls where applicable). If you’re validating with WAVE or doing a WCAG 2.1 AA pass, check at least the map view, search drawer, and material details drawer in all themes.
