# LMS Church App — DSKM / NG5 LMS

Production-oriented learning management frontend backed by **Firebase** (Authentication, Firestore, Callable Cloud Functions) and deployed as static assets on **Cloudflare Pages**. This repository separates a **Vite + TypeScript** web client from an isolated **Firebase Functions** sub-project.

## Architecture

| Layer | Technology | Responsibility |
|--------|------------|----------------|
| UI | Vite 7, TypeScript, Tailwind (PostCSS), DOM-first views | Shell, auth UX, assessments, classes, grades, attendance |
| Client config | `import.meta.env` (`VITE_*`) | Firebase web SDK config only (public keys by design) |
| Data | Firestore + callable HTTPS functions | Real-time reads/writes per `firestore.rules` |
| AI & privileged APIs | Firebase Functions v2 (Node 20) | Gemini calls, admin user listing, role updates; secrets via `process.env` / Firebase secrets |
| CDN / hosting | Cloudflare Pages | Serves `dist/`; `_redirects` / `_headers` in `public/` |

**Security model:** No Gemini or other privileged API keys ship in the browser. The client uses Firebase Auth; Cloud Functions re-verify the caller and role before accessing admin or AI paths. Dynamic HTML from AI flows through DOMPurify (`sanitizeHTML` in the UI layer).

## Repository layout

```
src/
  assets/           # Build-time styles (Tailwind entry), legal-page Vite entries
  core/             # Firebase init, env config, auth, theme, shims (Chart.js / jsPDF globals)
  data/             # Firestore and callable wrappers
  types/            # Shared TypeScript models (mirrored in functions for role parity)
  ui/               # Views, modals, tab modules
firebase-functions/ # Standalone npm project (not named `functions/` — reserved by Cloudflare Pages)
public/             # Production static assets copied into dist (_redirects, _headers, favicon.svg)
index.html          # Main app shell (large inline critical CSS for first paint)
privacy.html, terms.html   # Legal pages (Tailwind via Vite entry under src/assets/)
```

## Prerequisites

- Node.js **18+** (root) / **20** (Functions `engines` field)
- Firebase CLI (`npm i -g firebase-tools`)
- A Firebase project with Email/Password auth and Firestore enabled
- Optional: Gemini API key for AI features (Functions only)

## Setup

```bash
npm install
npm --prefix firebase-functions install
```

### Environment variables

| Location | Purpose |
|----------|---------|
| Root `.env` (from `.env.example`) | `VITE_FIREBASE_*` for the Vite client |
| `firebase-functions/.env` (from `firebase-functions/.env.example`) | `GEMINI_API_KEY` for local Functions / emulator |

Never commit `.env` files. On Cloudflare Pages, define the same `VITE_FIREBASE_*` names for production builds.

### First administrator

1. Sign up in the app (creates `users/{uid}` with role `student`).
2. In Firestore, set `users/{uid}.role` to `admin`.
3. Sign out and sign back in.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (default port 3000) |
| `npm run build` | `tsc` + production bundle to `dist/` |
| `npm run preview` | Local preview of `dist/` |
| `npm run deploy:backend` | Deploy Firestore rules/indexes + Cloud Functions |

Functions package: `npm --prefix firebase-functions run build` / `test`.

## Deploying

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Cloudflare Pages settings, authorized domains, and post-deploy checks.

## License & credits

Educational use. Credits: Adib, Erick, Saaeed, Lulya, Liya.
