# Deployment guide — Cloudflare Pages + Firebase

This document is the operational contract for shipping the LMS: what to configure, where secrets live, and how to verify a release.

## 1. Secrets and configuration

### Frontend (build-time)

- Variables are read as `import.meta.env.VITE_*` (see root `.env.example`).
- **Cloudflare Pages:** Project → Settings → Environment variables — add each `VITE_FIREBASE_*` for Production (and Preview if you use branch builds).
- A build without these variables still produces artifacts, but Firebase Auth and Firestore will not initialize.

### Cloud Functions (runtime)

- `GEMINI_API_KEY` must be available to the Functions runtime (`functions/.env` locally; [Firebase environment configuration](https://firebase.google.com/docs/functions/config-env) or Secret Manager in production).
- Never embed API keys in `functions/src` or client source.

### Git hygiene

Root `.gitignore` excludes `dist/`, `.env*`, `functions/lib/`, and `.wrangler/`. Do not commit build output or local secrets.

## 2. Pre-flight checklist

- [ ] Firebase project: Authentication (Email/Password) and Firestore enabled.
- [ ] `firestore.rules` and `firestore.indexes.json` deployed at least once.
- [ ] `npm run build` succeeds at repo root with production env vars (or CI with injected secrets).
- [ ] `npm --prefix functions run build` succeeds.
- [ ] `npm run deploy:backend` (or equivalent `firebase deploy`) has been run for this project ID.
- [ ] First admin exists (`users/{uid}.role == 'admin'`).

## 3. Cloudflare Pages (frontend)

1. **Build command:** `npm run build`  
2. **Output directory:** `dist`  
3. **Root directory:** repository root (default).

`public/_redirects` and `public/_headers` are copied into `dist` by Vite for SPA routing and security headers.

## 4. Firebase console (Auth)

Add your Pages hostname under **Authentication → Settings → Authorized domains** (e.g. `*.pages.dev` or your custom domain). Omitting this breaks sign-in on the deployed URL.

## 5. Post-deploy verification

- [ ] Sign-in and role-gated navigation (admin / teacher / student).
- [ ] Firestore-backed screens load without permission errors.
- [ ] One callable AI path (if Gemini is configured) completes within timeout.

## 6. Stack summary

| Concern | Where it runs | Config surface |
|--------|----------------|----------------|
| Static UI | Cloudflare Pages | `VITE_*` at build time |
| Auth & database | Firebase | Firebase console + rules |
| AI & admin callables | Cloud Functions | `GEMINI_API_KEY` / Firebase env |

Tailwind is compiled via PostCSS at build time; there is no Tailwind CDN in production HTML.
