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

**Root Wrangler file (`wrangler.json`):** Cloudflare’s Git-integrated Pages build looks for **`wrangler.toml`**, **`wrangler.json`**, or **`wrangler.jsonc`**. This repo commits a minimal **`wrangler.json`** with **`name`** and **`pages_build_output_dir`** (`./dist`) only. Runtime **compatibility date** stays in the dashboard (**Settings → Runtime**) so it cannot conflict with a second date in Git.

If the log says the Wrangler file is invalid, it must include **`pages_build_output_dir`**; otherwise Pages skips the file and may still fail.

**Node on Pages:** `.node-version` pins **Node 20** to match GitHub Actions (`setup-node`). You can also set **`NODE_VERSION`** to `20` under Variables (optional duplicate).

### 3.1 Variables and Secrets (dashboard) — naming matters

Under **Pages → Settings → Variables and Secrets**, each row has a **Name** and a **Value**. The name must be a single identifier, for example **`GEMINI_API_KEY`**.

- **Wrong:** a variable whose **name** is `GEMINI_API_KEY=`, `GEMINI_API_KEY =`, or any name containing spaces or `=` (those belong in the value field, not the name). Duplicate or malformed names can break the build and show up as a generic **internal error** after the Wrangler step.
- **Right:** name `GEMINI_API_KEY`, type Secret, value = your API key only.

This frontend is static **Vite** output; **`GEMINI_API_KEY` is not required on Cloudflare Pages** unless you add Pages Functions that call Gemini. Prefer **removing** unused Gemini secrets from the Pages project to reduce risk. Keep **`GEMINI_API_KEY`** for **Firebase Cloud Functions** (see §1).

### 3.2 If Cloudflare Git still shows “internal error”

Work through these in order:

1. Fix **Variables and Secrets** as in §3.1 (delete bad names, dedupe).
2. **Build command / output directory** — non-empty: e.g. `npm run build` or `npm ci && npm run build`, output **`dist`**. **`wrangler.json` must include `pages_build_output_dir`** (see above).
3. **Workers & Pages → Settings → Builds & deployments → Build system version** — **v3** ([changelog](https://developers.cloudflare.com/changelog/2025-05-30-pages-build-image-v3/)).
4. **Disable Git production builds** and rely on the **`deploy-pages`** GitHub Action (§3.4) if Cloudflare’s Git container keeps failing — see **§3.3** below (this is the reliable fix when logs show _internal error_ right after _Successfully read the Wrangler configuration file_).
5. If it still fails, contact Cloudflare support with the **deployment id** from the build log.

### 3.3 Stop using Cloudflare Git builds (when every deploy ends in “internal error”)

Some Pages projects hit a **generic internal error** immediately after Wrangler config is read, **before** `npm install`. That is a **Cloudflare-side** failure; the app repo cannot repair it from source code.

**Do this once:**

1. In **GitHub** → your repository → **Settings** → **Branches** → branch protection on `main`: if **“Cloudflare Pages”** (or similar) is a **required status check**, **remove** it so merges are not blocked by a broken Cloudflare Git build. You can keep **CI / verify** required.
2. In **Cloudflare** → **Workers & Pages** → **lms-church-app** → **Settings** → **Builds & deployments**:
   - Under **Production branch** / **Automatic deployments**, **disable** automatic production deployments from Git, **or**
   - **Disconnect** the Git repository from this Pages project (create a new Pages project later if you need a fresh link).
3. Keep shipping production by pushing to `main` with **`deploy-pages`** (§3.4) only — it uploads `dist` via the Pages API and does **not** use the failing Git build container.

After Git builds are off, the site still updates whenever **`deploy-pages`** succeeds; you only lose Cloudflare’s redundant Git-based build.

### 3.4 GitHub Actions deploy (recommended)

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

**Cloudflare dashboard:** To avoid duplicate builds (one from Cloudflare Git, one from GitHub Actions), open **Pages → lms-church-app → Settings → Builds** and **disable** automatic production builds from Git if you rely entirely on **`deploy-pages`**. If you keep Git builds enabled, keep **`wrangler.json` valid** (includes `pages_build_output_dir`) and keep the dashboard **build command** set.

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
