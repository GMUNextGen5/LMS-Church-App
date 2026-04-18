# Deployment guide — Cloudflare Pages + Firebase

This document is the operational contract for shipping the LMS: what to configure, where secrets live, and how to verify a release.

## 1. Secrets and configuration

### Frontend (build-time)

- Variables are read as `import.meta.env.VITE_*` (see root `.env.example`).
- **Cloudflare Pages:** Project → Settings → Environment variables — add each `VITE_FIREBASE_*` for Production (and Preview if you use branch builds).
- A build without these variables still produces artifacts, but Firebase Auth and Firestore will not initialize.

### Cloud Functions (runtime)

- `GEMINI_API_KEY` must be available to the Functions runtime (`firebase-functions/.env` locally; [Firebase environment configuration](https://firebase.google.com/docs/functions/config-env) or Secret Manager in production).
- Never embed API keys in `firebase-functions/src` or client source.

### Git hygiene

Root `.gitignore` excludes `dist/`, `.env*`, `firebase-functions/lib/`, and `.wrangler/`. Do not commit build output or local secrets.

## 2. Pre-flight checklist

- [ ] Firebase project: Authentication (Email/Password) and Firestore enabled.
- [ ] `firestore.rules` and `firestore.indexes.json` deployed at least once.
- [ ] `npm run build` succeeds at repo root with production env vars (or CI with injected secrets).
- [ ] `npm --prefix firebase-functions run build` succeeds.
- [ ] `npm run deploy:backend` (or equivalent `firebase deploy`) has been run for this project ID.
- [ ] First admin exists (`users/{uid}.role == 'admin'`).

## 3. Cloudflare Pages (frontend)

1. **Build command:** `npm ci && npm run build` (or `npm install && npm run build` if you do not use a lockfile in CI)
2. **Output directory:** `dist`
3. **Root directory:** repository root (default).

`public/_redirects` and `public/_headers` are copied into `dist` by Vite for SPA routing and security headers.

**Do not commit a root `wrangler.toml`:** When that file exists and sets `pages_build_output_dir`, Cloudflare Pages’ Git-connected **v2** builder treats Wrangler as the source of truth and has repeatedly failed with an **internal error immediately after** “Successfully read the Wrangler configuration file” (often before `npm install` runs). This repository intentionally omits `wrangler.toml` from Git and provides **`wrangler.example.toml`** instead. For local `wrangler pages dev`, copy the example to `wrangler.toml` (ignored by Git).

### 3.1 GitHub Actions deploy (recommended)

The repo ships a **`deploy-pages` job** in `.github/workflows/ci.yml` that builds on GitHub Actions and uploads `dist` with the official Pages API (equivalent to `wrangler pages deploy`). Use it whenever you want production deploys without relying on Cloudflare’s Git builder.

**Repository secrets** (GitHub → Settings → Secrets and variables → Actions):

| Secret                              | Purpose                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`              | API token with **Account → Cloudflare Pages → Edit** (and read account if prompted). |
| `CLOUDFLARE_ACCOUNT_ID`             | Account ID from the Cloudflare dashboard sidebar.                                    |
| `VITE_FIREBASE_API_KEY`             | Same values as in Pages → Settings → Environment variables (production).             |
| `VITE_FIREBASE_AUTH_DOMAIN`         |                                                                                      |
| `VITE_FIREBASE_PROJECT_ID`          |                                                                                      |
| `VITE_FIREBASE_STORAGE_BUCKET`      |                                                                                      |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` |                                                                                      |
| `VITE_FIREBASE_APP_ID`              |                                                                                      |

**Important:** Variables you set under **Cloudflare → Pages → Settings → Variables** only apply when **Cloudflare** runs the build. They are **not** visible to **GitHub Actions**. The `deploy-pages` job runs `npm run build` on GitHub’s runners, so you must **copy the same `VITE_*` values** (and add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`, which only exist in GitHub) into **GitHub → Settings → Secrets and variables → Actions**. Use the same names so the workflow `env:` block matches.

After these are set, pushes to `main` run **verify** then **deploy-pages** for `GMUNextGen5/LMS-Church-App` only.

**Cloudflare dashboard:** To avoid duplicate builds (one from Cloudflare Git, one from GitHub Actions), open **Pages → lms-church-app → Settings → Builds** and **disable** automatic production builds from Git if you rely entirely on **`deploy-pages`**. If you keep Git builds enabled, leave **no** committed root `wrangler.toml` so the dashboard **build command** and **output directory** above drive the build.

## 4. Firebase console (Auth)

Add your Pages hostname under **Authentication → Settings → Authorized domains** (e.g. `*.pages.dev` or your custom domain). Omitting this breaks sign-in on the deployed URL.

## 5. Post-deploy verification

- [ ] Sign-in and role-gated navigation (admin / teacher / student).
- [ ] Firestore-backed screens load without permission errors.
- [ ] One callable AI path (if Gemini is configured) completes within timeout.

## 6. Stack summary

| Concern              | Where it runs    | Config surface                  |
| -------------------- | ---------------- | ------------------------------- |
| Static UI            | Cloudflare Pages | `VITE_*` at build time          |
| Auth & database      | Firebase         | Firebase console + rules        |
| AI & admin callables | Cloud Functions  | `GEMINI_API_KEY` / Firebase env |

Tailwind is compiled via PostCSS at build time; there is no Tailwind CDN in production HTML.
